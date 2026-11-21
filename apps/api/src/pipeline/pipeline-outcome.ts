import { Logger } from '@nestjs/common';
import type { FindingResult, Position, Prisma } from '@prisma/client';
import { ACTIVE_REASON, DECIDED } from '../requests/flag-reasons.js';
import { buildFullReport, resultLabel } from './check-report.js';
import { type FindingDraft, PASSING } from './findings.js';
import { PipelineError } from './pipeline-error.js';
import {
  FLAG_SOURCE_PIPELINE,
  PIPELINE_ERROR_TEXT,
} from './pipeline.constants.js';
import { CHECKS, type CheckKind, checkById } from './rule-set.js';

const logger = new Logger('PipelineOutcome');

// The results each kind of check may give (§3.2, §7).
const ALLOWED: Record<CheckKind, readonly FindingResult[]> = {
  FIELD: ['PASSED', 'FAILED', 'NOT_FOUND', 'AMBIGUOUS'],
  CONSISTENCY: ['PASSED', 'INCONSISTENT'],
  PURPOSE: ['COMPATIBLE', 'INCOMPATIBLE', 'INDETERMINATE'],
};

// Auto-clear or flag (Sprint 3 spec §8, US-11), inside the transaction that
// marks the run COMPLETED. Anything thrown here rolls the whole transaction
// back, and the runner ends the run flagged with a pipeline error instead,
// so a request never ends with half its findings or with a system decision
// but no report (§9.3).
//
// 1. Stores this run's findings. A check this run repeats supersedes the
//    earlier finding of that check and its flag reason (§3.2, §10), and any
//    earlier pipeline-error reason is superseded.
// 2. Raises a PIPELINE flag reason for every finding that is not passed or
//    compatible, and a pipeline-error reason if any check of the rule set has
//    no current finding (a check the pipeline did not run never passes).
// 3. Approves the request as a system decision, with the full report, only
//    if every check passed, the provider endorsed it and no reason is active
//    (§2.4). Otherwise the request leaves automated review flagged. The
//    system never rejects.
export async function completeReview(
  tx: Prisma.TransactionClient,
  runId: string,
  requestId: string,
  results: Record<string, unknown>,
): Promise<void> {
  const drafts = collectFindings(results);
  const request = await tx.dataSharingRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { status: true, providerResponse: { select: { position: true } } },
  });
  // Nobody can decide a request under automated review (§3.1), so this
  // does not happen; if it did, a decision stays as it is (Sprint 2 §3.2).
  if (DECIDED.includes(request.status)) return;

  const now = new Date();
  const repeated = await tx.finding.findMany({
    where: {
      requestId,
      supersededAt: null,
      checkId: { in: drafts.map((d) => d.checkId) },
    },
    select: { id: true },
  });
  const repeatedIds = repeated.map((f) => f.id);
  await tx.finding.updateMany({
    where: { id: { in: repeatedIds } },
    data: { supersededAt: now },
  });
  await tx.flagReason.updateMany({
    where: {
      OR: [
        { findingId: { in: repeatedIds } },
        { requestId, source: FLAG_SOURCE_PIPELINE, findingId: null },
      ],
      ...ACTIVE_REASON,
    },
    data: { supersededAt: now },
  });

  for (const draft of drafts) {
    const finding = await tx.finding.create({
      data: {
        requestId,
        runId,
        checkId: draft.checkId,
        checkName: draft.checkName,
        result: draft.result,
        citation: draft.citation,
        ruleSetVersion: draft.ruleSetVersion,
        requesterVisible: draft.requesterVisible,
        explanation: draft.explanation,
        evidence: draft.evidence as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    if (!PASSING.includes(draft.result)) {
      await tx.flagReason.create({
        data: {
          requestId,
          source: FLAG_SOURCE_PIPELINE,
          text: reasonText(draft),
          findingId: finding.id,
        },
      });
    }
  }

  const current = await tx.finding.findMany({
    where: { requestId, supersededAt: null },
    select: { checkId: true, result: true },
  });
  const missing = CHECKS.filter(
    (check) => !current.some((f) => f.checkId === check.id),
  );
  if (missing.length > 0) {
    logger.warn(
      `Pipeline run ${runId} has no finding for ${missing.map((c) => c.id).join(', ')}; the request is flagged.`,
    );
    await tx.flagReason.create({
      data: {
        requestId,
        source: FLAG_SOURCE_PIPELINE,
        text: PIPELINE_ERROR_TEXT,
      },
    });
  }

  const activeReasons = await tx.flagReason.count({
    where: { requestId, ...ACTIVE_REASON },
  });
  const approve =
    passesOutcomeRule(current, request.providerResponse?.position) &&
    activeReasons === 0;

  if (approve) {
    const { count } = await tx.dataSharingRequest.updateMany({
      where: { id: requestId, status: 'UNDER_AUTOMATED_REVIEW' },
      data: { status: 'APPROVED' },
    });
    if (count === 1) {
      const report = await buildFullReport(tx, requestId, 'APPROVED');
      if (!report) throw new PipelineError('The check report is missing.');
      await tx.decision.create({
        data: {
          requestId,
          outcome: 'APPROVED',
          madeBy: 'SYSTEM',
          report: report as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return;
  }
  await leaveAutomatedReview(tx, requestId);
}

// The outcome rule (§2.4): the provider endorsed the request and every check
// of the rule set has a finding that passed or was compatible. Anything else
// flags it. Shared with the evaluation.
export function passesOutcomeRule(
  findings: readonly { checkId: string; result: FindingResult }[],
  position: Position | undefined,
): boolean {
  return (
    position === 'ENDORSED' &&
    CHECKS.every((check) => {
      const own = findings.filter((f) => f.checkId === check.id);
      return own.length === 1 && PASSING.includes(own[0].result);
    })
  );
}

// Moves a request out of automated review once its run has ended. It lands
// on the Sprint 2 status; whether it is flagged is worked out from its active
// flag reasons (spec §3.1).
export async function leaveAutomatedReview(
  db: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await db.dataSharingRequest.updateMany({
    where: { id: requestId, status: 'UNDER_AUTOMATED_REVIEW' },
    data: { status: 'PROVIDER_RESPONDED' },
  });
}

// Every finding the run's check steps saved (`{ findings: [...] }`), checked
// against the rule set: a known check, a result that check allows, and at
// most one finding per check.
export function collectFindings(
  results: Record<string, unknown>,
): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const result of Object.values(results)) {
    const findings = (result as { findings?: unknown } | null)?.findings;
    if (!Array.isArray(findings)) continue;
    drafts.push(...(findings as FindingDraft[]));
  }
  const seen = new Set<string>();
  for (const draft of drafts) {
    const check = CHECKS.find((c) => c.id === draft?.checkId);
    if (!check || !ALLOWED[check.kind].includes(draft.result)) {
      throw new PipelineError(
        'A check step saved a finding the rule set does not allow.',
      );
    }
    if (seen.has(draft.checkId)) {
      throw new PipelineError(`Two findings for ${draft.checkId}.`);
    }
    seen.add(draft.checkId);
  }
  return drafts;
}

// The flag reason a finding raises (§3.2): which check, its result and why,
// citing the clause.
export function reasonText(draft: FindingDraft): string {
  const check = checkById(draft.checkId);
  const label = resultLabel(draft.result);
  const why = draft.explanation.trim();
  return `${check.id} ${draft.checkName}: ${label}.${why ? ` ${why}` : ''} (${draft.citation})`;
}
