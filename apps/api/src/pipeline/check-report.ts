import type {
  DecisionOutcome,
  FindingResult,
  PipelineRunTrigger,
  Prisma,
} from '@prisma/client';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../requests/flag-reasons.js';
import type { FindingEvidence } from './findings.js';
import { CHECKS } from './rule-set.js';
import { FLAG_SOURCE_PIPELINE } from './pipeline.constants.js';

// The full check report (Sprint 3 spec §3.6, §9.1, §9.3): every finding,
// superseded ones marked as such, and for a request that was not auto-cleared
// a summary of why. It is stored in the decision record when a decision is
// made, by the system or an officer, so it always shows what the pipeline
// found at that time. Plain JSON, so it survives any later change to the rule
// set, the model setting or this code.
//
// This is the officer's and provider's view. The requester's reduced view
// (§3.6) is built from it by §9.1 and keeps only findings whose
// `requesterVisible` is true, the outcome, and nothing else.

export interface ReportFinding {
  checkId: string;
  checkName: string;
  result: FindingResult;
  citation: string;
  ruleSetVersion: string;
  requesterVisible: boolean;
  explanation: string;
  evidence: FindingEvidence[];
  superseded: boolean;
  supersededAt: string | null;
  createdAt: string;
}

export interface CheckReport {
  // The run the report reflects: the latest that ended.
  run: {
    id: string;
    trigger: PipelineRunTrigger;
    ruleSetVersion: string;
    models: { step: string; model: string }[];
    endedAt: string | null;
  };
  outcome: DecisionOutcome | 'FLAGGED';
  // Current findings in rule-set order, then superseded ones, newest first.
  findings: ReportFinding[];
  // Why the request was not auto-cleared; null when it was.
  summary: string | null;
  generatedAt: string;
}

const RESULT_LABEL: Record<FindingResult, string> = {
  PASSED: 'passed',
  FAILED: 'failed',
  NOT_FOUND: 'not found',
  AMBIGUOUS: 'ambiguous',
  INCONSISTENT: 'inconsistent',
  COMPATIBLE: 'compatible',
  INCOMPATIBLE: 'incompatible',
  INDETERMINATE: 'indeterminate',
};

export function resultLabel(result: FindingResult): string {
  return RESULT_LABEL[result];
}

// The full report of a request, or null when it has had no pipeline run
// (requests from before Sprint 3 have no report, §2.16, §3.6). `outcome` is
// the decision being recorded, if any.
export async function buildFullReport(
  db: Prisma.TransactionClient,
  requestId: string,
  outcome?: DecisionOutcome,
): Promise<CheckReport | null> {
  const run = await db.pipelineRun.findFirst({
    where: { requestId, state: { in: ['COMPLETED', 'FAILED'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      trigger: true,
      ruleSetVersion: true,
      models: true,
      endedAt: true,
    },
  });
  if (!run) return null;

  const [findings, reasons] = await Promise.all([
    db.finding.findMany({
      where: { requestId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
    db.flagReason.findMany({
      where: { requestId, supersededAt: null },
      select: { source: true, findingId: true },
    }),
  ]);

  const order = (checkId: string) => CHECKS.findIndex((c) => c.id === checkId);
  const current = findings
    .filter((f) => f.supersededAt === null)
    .sort((x, y) => order(x.checkId) - order(y.checkId));
  const superseded = findings.filter((f) => f.supersededAt !== null);

  return {
    run: {
      id: run.id,
      trigger: run.trigger,
      ruleSetVersion: run.ruleSetVersion,
      models: run.models as unknown as { step: string; model: string }[],
      endedAt: run.endedAt?.toISOString() ?? null,
    },
    outcome: outcome ?? 'FLAGGED',
    findings: [...current, ...superseded].map((f) => ({
      checkId: f.checkId,
      checkName: f.checkName,
      result: f.result,
      citation: f.citation,
      ruleSetVersion: f.ruleSetVersion,
      requesterVisible: f.requesterVisible,
      explanation: f.explanation,
      evidence: f.evidence as unknown as FindingEvidence[],
      superseded: f.supersededAt !== null,
      supersededAt: f.supersededAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
    summary: summarise(
      reasons,
      current.filter((f) => reasons.some((r) => r.findingId === f.id)),
    ),
    generatedAt: new Date().toISOString(),
  };
}

// Why the request was not auto-cleared, from its active flag reasons. Null
// when it has none, which is what an auto-cleared request looks like. It
// never quotes the objection: it says only that there was one.
function summarise(
  reasons: { source: string; findingId: string | null }[],
  failing: { checkId: string; checkName: string; result: FindingResult }[],
): string | null {
  if (reasons.length === 0) return null;
  const parts: string[] = [];
  if (reasons.some((r) => r.source === FLAG_SOURCE_PROVIDER_OBJECTION)) {
    parts.push('The providing entity objected to the request.');
  }
  if (
    reasons.some(
      (r) => r.source === FLAG_SOURCE_PIPELINE && r.findingId === null,
    )
  ) {
    parts.push('The automated review could not be completed.');
  }
  if (failing.length > 0) {
    const list = failing
      .map((f) => `${f.checkId} ${f.checkName} (${RESULT_LABEL[f.result]})`)
      .join('; ');
    parts.push(
      failing.length === 1
        ? `1 check did not pass: ${list}.`
        : `${failing.length} checks did not pass: ${list}.`,
    );
  }
  const known = new Set([FLAG_SOURCE_PROVIDER_OBJECTION, FLAG_SOURCE_PIPELINE]);
  if (reasons.some((r) => !known.has(r.source))) {
    parts.push('Another flag reason needs an officer’s decision.');
  }
  return `Not auto-cleared. ${parts.join(' ')}`;
}
