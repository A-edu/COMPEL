import type { FindingResult, Position, PrismaClient } from '@prisma/client';
import { draftFinding, type FindingDraft } from '../src/pipeline/findings.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import { CHECKS, RULE_SET_VERSION } from '../src/pipeline/rule-set.js';

// Stand-in pipelines for e2e tests (Sprint 3 spec §5.6): steps that save
// findings directly, with no extraction and no model, so a test chooses what
// the checks found. The outcome (§8) is the app's own.

// The result of every rule-set check that passes: compatible for PC-01,
// passed for the rest.
export function passingResult(checkId: string): FindingResult {
  return checkId.startsWith('PC-') ? 'COMPATIBLE' : 'PASSED';
}

// One finding per rule-set check: passing, unless `results` says otherwise.
export function findingsFor(
  results: Record<string, FindingResult> = {},
  ruleSetVersion = RULE_SET_VERSION,
): FindingDraft[] {
  return CHECKS.map((check) => {
    const result = results[check.id] ?? passingResult(check.id);
    return draftFinding(
      check.id,
      ruleSetVersion,
      result,
      result === passingResult(check.id)
        ? `${check.name} meets the rule.`
        : `${check.name} does not meet the rule (stand-in).`,
      [],
    );
  });
}

// A pipeline of one step that saves the findings of findingsFor(results),
// with the rule-set version the run recorded. `leaveOut` drops checks, as a
// pipeline missing a step would.
export function standInChecks(
  results: Record<string, FindingResult> = {},
  leaveOut: string[] = [],
): PipelineStep[] {
  return [
    {
      name: 'stand-in-checks',
      run: async (ctx) => ({
        result: {
          findings: findingsFor(results, ctx.ruleSetVersion).filter(
            (f) => !leaveOut.includes(f.checkId),
          ),
        },
      }),
    },
  ];
}

// Replaces the steps a test app runs from now on (createTestApp keeps the
// array it was given, so changing its contents changes the pipeline).
export function useSteps(target: PipelineStep[], steps: PipelineStep[]): void {
  target.splice(0, target.length, ...steps);
}

// A provider response recorded the way Sprint 2 recorded it, before the
// pipeline existed: Responded, with no run, flagged only by an objection.
// After Sprint 3's release a new response never rests here; requests from
// before it do (§3.1, §5.7).
export async function recordSprint2Response(
  prisma: PrismaClient,
  {
    requestId,
    providerUserId,
    position,
    objection,
  }: {
    requestId: string;
    providerUserId: string;
    position: Position;
    objection?: string;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ropa = await tx.document.create({
      data: {
        requestId,
        kind: 'ROPA',
        storageKey: `test/sprint-2-ropa-${requestId}.pdf`,
        originalName: 'ropa-entry.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        uploadedById: providerUserId,
      },
    });
    await tx.providerResponse.create({
      data: {
        requestId,
        ropaDocumentId: ropa.id,
        position,
        objectionReason: position === 'OBJECTED' ? (objection ?? null) : null,
        respondedById: providerUserId,
      },
    });
    if (position === 'OBJECTED') {
      await tx.flagReason.create({
        data: {
          requestId,
          source: 'PROVIDER_OBJECTION',
          text: objection ?? 'Objected.',
        },
      });
    }
    await tx.dataSharingRequest.update({
      where: { id: requestId },
      data: { status: 'PROVIDER_RESPONDED' },
    });
  });
}
