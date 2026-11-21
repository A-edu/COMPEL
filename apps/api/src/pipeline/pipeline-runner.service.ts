import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PipelineRunTrigger } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service.js';
import { DECIDED } from '../requests/flag-reasons.js';
import { PipelineError } from './pipeline-error.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface.js';
import {
  MODEL_CLIENT,
  ModelCallError,
  type ModelClient,
} from './model/model-client.js';
import { completeReview, leaveAutomatedReview } from './pipeline-outcome.js';
import {
  PIPELINE_STEP_SOURCE,
  type PipelineContext,
  type PipelineStep,
  type StepSource,
} from './pipeline-steps.js';
import {
  ADVANCE_ACCEPT_TIMEOUT_MS,
  FLAG_SOURCE_PIPELINE,
  INTERNAL_TOKEN_HEADER,
  LEASE_MS,
  LEASE_RENEW_MS,
  PIPELINE_ERROR_TEXT,
  RULE_SET_VERSION,
  RUN_CAP_MS,
} from './pipeline.constants.js';

export { PipelineError };

interface StepEntry {
  step: string;
  model: string;
}

// Runs the automated review, one step per request (Sprint 3 spec §2.3, §4.3).
//
// - createRun() is called inside the provider's response transaction.
// - dispatch() triggers the next step and never throws: in production it is
//   an internal request to the app's own public URL, so Autoscale keeps an
//   instance working while a step runs; in the workspace and in tests it runs
//   in-process.
// - advance() runs one step of a queued run. Claiming the step is a single
//   conditional update from QUEUED to RUNNING, so a repeated or concurrent
//   call does nothing, and nothing here can create a run or a decision.
// - fail() ends a run flagged with a pipeline-error reason.
@Injectable()
export class PipelineRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineRunner.name);
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    @Inject(PIPELINE_STEP_SOURCE) private readonly stepSource: StepSource,
  ) {}

  onModuleInit(): void {
    if (!this.viaHttp()) return;
    if (!this.internalToken()) {
      this.logger.warn(
        'PIPELINE_INTERNAL_TOKEN is not set: automated reviews will end flagged with a pipeline error.',
      );
    }
    const base = this.selfUrl();
    if (base) {
      this.logger.log(`Pipeline steps advance through ${base}.`);
    } else {
      this.logger.warn(
        'Neither PIPELINE_SELF_URL nor REPLIT_DOMAINS is set: automated reviews will end flagged with a pipeline error.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }

  // A new queued run for this request, with the step list and the model of
  // each step fixed now, so a later settings change never alters it.
  async createRun(
    tx: Prisma.TransactionClient,
    requestId: string,
    trigger: PipelineRunTrigger,
  ): Promise<string> {
    const entries: StepEntry[] = this.steps().map((step) => ({
      step: step.name,
      model: this.model.modelFor(step.name),
    }));
    const run = await tx.pipelineRun.create({
      data: {
        requestId,
        trigger,
        models: entries as unknown as Prisma.InputJsonValue,
        ruleSetVersion: RULE_SET_VERSION,
      },
      select: { id: true },
    });
    return run.id;
  }

  // Triggers the next step of a queued run. Never throws: a step that cannot
  // be triggered ends the run flagged.
  async dispatch(runId: string): Promise<void> {
    if (!this.viaHttp()) {
      this.track(
        new Promise((resolve) => setImmediate(resolve)).then(() =>
          this.advance(runId),
        ),
      );
      return;
    }
    try {
      await this.requestAdvance(runId);
    } catch (error) {
      this.logger.error(
        `Could not trigger the next step of pipeline run ${runId}: ${safeMessage(error)}`,
      );
      await this.fail(runId);
    }
  }

  // Waits for every in-process step, including the steps they trigger.
  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled(this.inflight);
    }
  }

  // Whether `token` is the internal token, compared in constant time. False
  // when no token is configured.
  acceptsToken(token: string | undefined): boolean {
    const expected = this.internalToken();
    if (!expected || typeof token !== 'string' || token === '') return false;
    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(token), digest(expected));
  }

  // Runs the next step of a queued run, then triggers the following one or
  // finishes the run. 'skipped' when the run is not queued (unknown, already
  // claimed, finished or failed): repeated calls are harmless.
  async advance(runId: string): Promise<'ran' | 'skipped'> {
    const now = Date.now();
    const { count } = await this.prisma.pipelineRun.updateMany({
      where: { id: runId, state: 'QUEUED' },
      data: { state: 'RUNNING', leaseUntil: new Date(now + LEASE_MS) },
    });
    if (count !== 1) return 'skipped';

    let renew: NodeJS.Timeout | undefined;
    try {
      await this.prisma.pipelineRun.updateMany({
        where: { id: runId, startedAt: null },
        data: { startedAt: new Date(now) },
      });
      const run = await this.prisma.pipelineRun.findUniqueOrThrow({
        where: { id: runId },
        include: {
          request: {
            include: {
              documents: true,
              providerResponse: true,
              requestingEntity: { select: { name: true } },
              providingEntity: { select: { name: true } },
            },
          },
        },
      });
      if (run.startedAt && now - run.startedAt.getTime() > RUN_CAP_MS) {
        throw new PipelineError('The run exceeded its time limit.');
      }

      const entries = run.models as unknown as StepEntry[];
      const results = (run.stepResults ?? {}) as Record<string, unknown>;
      if (run.nextStep >= entries.length) {
        await this.finish(runId, results);
        return 'ran';
      }

      const entry = entries[run.nextStep];
      const step = this.steps().find((s) => s.name === entry.step);
      if (!step) throw new PipelineError(`Unknown step "${entry.step}".`);

      renew = setInterval(() => {
        this.prisma.pipelineRun
          .updateMany({
            where: { id: runId, state: 'RUNNING' },
            data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
          })
          .catch((error: unknown) =>
            this.logger.warn(
              `Could not renew the lease of pipeline run ${runId}: ${safeMessage(error)}`,
            ),
          );
      }, LEASE_RENEW_MS);
      renew.unref();

      const outcome = await step.run(this.context(run, entry, results));
      clearInterval(renew);
      renew = undefined;

      const saved = {
        ...results,
        [step.name]: toJson(outcome.result, step.name),
      };
      const nextStep = outcome.more ? run.nextStep : run.nextStep + 1;
      if (nextStep >= entries.length) {
        await this.finish(runId, saved);
        return 'ran';
      }

      const queued = await this.prisma.pipelineRun.updateMany({
        where: { id: runId, state: 'RUNNING' },
        data: {
          state: 'QUEUED',
          leaseUntil: null,
          nextStep,
          stepResults: saved as Prisma.InputJsonValue,
        },
      });
      // Zero means the sweeper ended the run while the step was working.
      if (queued.count === 1) await this.dispatch(runId);
      return 'ran';
    } catch (error) {
      if (renew) clearInterval(renew);
      this.logger.error(`Pipeline run ${runId} failed: ${safeMessage(error)}`);
      await this.fail(runId);
      return 'ran';
    }
  }

  // Ends a queued or running run as FAILED and flags its request with the
  // pipeline-error reason (§2.3, §3.2). `where` narrows which runs qualify,
  // so the sweeper only fails a run that is still stale. False when the run
  // had already ended. Never throws.
  async fail(
    runId: string,
    where: Prisma.PipelineRunWhereInput = {},
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.pipelineRun.updateMany({
          where: {
            AND: [{ id: runId, state: { in: ['QUEUED', 'RUNNING'] } }, where],
          },
          data: { state: 'FAILED', endedAt: new Date(), leaseUntil: null },
        });
        if (count !== 1) return false;

        const { requestId } = await tx.pipelineRun.findUniqueOrThrow({
          where: { id: runId },
          select: { requestId: true },
        });
        const request = await tx.dataSharingRequest.findUniqueOrThrow({
          where: { id: requestId },
          select: { status: true },
        });
        // A decided request stays decided (Sprint 2 §3.2).
        if (!DECIDED.includes(request.status)) {
          await tx.flagReason.create({
            data: {
              requestId,
              source: FLAG_SOURCE_PIPELINE,
              text: PIPELINE_ERROR_TEXT,
            },
          });
        }
        await leaveAutomatedReview(tx, requestId);
        return true;
      });
    } catch (error) {
      this.logger.error(
        `Could not end pipeline run ${runId}: ${safeMessage(error)}`,
      );
      return false;
    }
  }

  private async finish(
    runId: string,
    results: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.pipelineRun.updateMany({
        where: { id: runId, state: 'RUNNING' },
        data: {
          state: 'COMPLETED',
          endedAt: new Date(),
          leaseUntil: null,
          stepResults: results as Prisma.InputJsonValue,
        },
      });
      if (count !== 1) return;
      const { requestId } = await tx.pipelineRun.findUniqueOrThrow({
        where: { id: runId },
        select: { requestId: true },
      });
      await completeReview(tx, runId, requestId, results);
    });
  }

  private context(
    run: Prisma.PipelineRunGetPayload<{
      include: {
        request: {
          include: {
            documents: true;
            providerResponse: true;
            requestingEntity: { select: { name: true } };
            providingEntity: { select: { name: true } };
          };
        };
      };
    }>,
    entry: StepEntry,
    results: Record<string, unknown>,
  ): PipelineContext {
    const response = run.request.providerResponse;
    if (!response) throw new PipelineError('The request has no response.');
    return {
      runId: run.id,
      request: {
        id: run.request.id,
        reference: run.request.reference,
        position: response.position,
        objectionReason: response.objectionReason,
        requestingEntity: run.request.requestingEntity.name,
        providingEntity: run.request.providingEntity.name,
      },
      documents: run.request.documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        load: async () =>
          streamToBuffer(await this.storage.get(doc.storageKey)),
      })),
      results,
      ruleSetVersion: run.ruleSetVersion,
      callModel: (request) =>
        this.model.generate({
          ...request,
          step: entry.step,
          model: entry.model,
        }),
    };
  }

  // The internal request for the next step. Resolves once the endpoint has
  // accepted it (202); the response body, a heartbeat, is read until the
  // step ends so the connection stays open.
  private async requestAdvance(runId: string): Promise<void> {
    const base = this.selfUrl();
    const token = this.internalToken();
    if (!base || !token) {
      throw new PipelineError(
        'The internal advance request is not configured.',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      ADVANCE_ACCEPT_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(
        `${base}/api/internal/pipeline-runs/${encodeURIComponent(runId)}/advance`,
        {
          method: 'POST',
          headers: { [INTERNAL_TOKEN_HEADER]: token },
          signal: controller.signal,
        },
      );
    } catch {
      throw new PipelineError('The internal advance request failed.');
    } finally {
      clearTimeout(timer);
    }
    if (response.status !== 202) {
      await response.body?.cancel().catch(() => undefined);
      throw new PipelineError(
        `The internal advance request returned ${response.status}.`,
      );
    }
    void response.body?.pipeTo(new WritableStream()).catch(() => undefined);
  }

  private steps(): PipelineStep[] {
    return this.stepSource();
  }

  // Production steps go through the public URL; elsewhere they run
  // in-process unless PIPELINE_SELF_URL is set (to try the internal request
  // in the workspace).
  private viaHttp(): boolean {
    return (
      this.config.get<string>('NODE_ENV') === 'production' ||
      Boolean(this.config.get<string>('PIPELINE_SELF_URL')?.trim())
    );
  }

  private selfUrl(): string | undefined {
    const explicit = this.config.get<string>('PIPELINE_SELF_URL')?.trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const domain = this.config
      .get<string>('REPLIT_DOMAINS')
      ?.split(',')[0]
      ?.trim();
    return domain ? `https://${domain}` : undefined;
  }

  private internalToken(): string | undefined {
    const token = this.config.get<string>('PIPELINE_INTERNAL_TOKEN')?.trim();
    return token ? token : undefined;
  }

  private track(promise: Promise<unknown>): void {
    const tracked = promise
      .catch((error: unknown) =>
        this.logger.error(`Pipeline step failed: ${safeMessage(error)}`),
      )
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }
}

// Messages of our own errors only: anything else could quote a prompt, a
// document or a query.
function safeMessage(error: unknown): string {
  if (error instanceof PipelineError || error instanceof ModelCallError) {
    return error.message;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `database error ${error.code}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

function toJson(value: unknown, step: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    throw new PipelineError(
      `Step "${step}" returned a result that is not JSON.`,
    );
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
