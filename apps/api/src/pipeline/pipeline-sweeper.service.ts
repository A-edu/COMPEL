import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PipelineRunner } from './pipeline-runner.service.js';
import { LEASE_MS, SWEEP_INTERVAL_MS } from './pipeline.constants.js';

// Ends runs whose instance stopped (Sprint 3 spec §2.3, §4.3): a running step
// whose lease lapsed, or a queued step nobody picked up within a lease. Each
// is ended flagged with a pipeline-error reason. It runs when the app starts
// and every minute, and never runs a step, so starting the app makes no model
// call (§5.7).
@Injectable()
export class PipelineSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineSweeper.name);
  private timer?: NodeJS.Timeout;
  private sweeping?: Promise<number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: PipelineRunner,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.sweeping;
  }

  // How many runs it ended. One sweep at a time.
  sweep(): Promise<number> {
    this.sweeping ??= this.sweepOnce().finally(() => {
      this.sweeping = undefined;
    });
    return this.sweeping;
  }

  private async sweepOnce(): Promise<number> {
    try {
      const now = new Date();
      const stale: Prisma.PipelineRunWhereInput = {
        OR: [
          { state: 'RUNNING', leaseUntil: { lt: now } },
          {
            state: 'QUEUED',
            updatedAt: { lt: new Date(now.getTime() - LEASE_MS) },
          },
        ],
      };
      const runs = await this.prisma.pipelineRun.findMany({
        where: stale,
        select: { id: true },
      });
      let ended = 0;
      for (const { id } of runs) {
        if (await this.runner.fail(id, stale)) ended++;
      }
      if (ended > 0) {
        this.logger.warn(`Ended ${ended} interrupted pipeline run(s) flagged.`);
      }
      return ended;
    } catch {
      this.logger.error('The pipeline sweep failed.');
      return 0;
    }
  }
}
