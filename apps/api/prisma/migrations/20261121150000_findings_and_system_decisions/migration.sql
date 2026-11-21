-- CreateEnum
CREATE TYPE "DecisionMaker" AS ENUM ('OFFICER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FindingResult" AS ENUM ('PASSED', 'FAILED', 'NOT_FOUND', 'AMBIGUOUS', 'INCONSISTENT', 'COMPATIBLE', 'INCOMPATIBLE', 'INDETERMINATE');

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "madeBy" "DecisionMaker" NOT NULL DEFAULT 'OFFICER',
ADD COLUMN     "report" JSONB,
ALTER COLUMN "justification" DROP NOT NULL,
ALTER COLUMN "decidedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FlagReason" ADD COLUMN     "findingId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "result" "FindingResult" NOT NULL,
    "citation" TEXT NOT NULL,
    "ruleSetVersion" TEXT NOT NULL,
    "requesterVisible" BOOLEAN NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Finding_requestId_idx" ON "Finding"("requestId");

-- CreateIndex
CREATE INDEX "Finding_runId_idx" ON "Finding"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "FlagReason_findingId_key" ON "FlagReason"("findingId");

-- AddForeignKey
ALTER TABLE "FlagReason" ADD CONSTRAINT "FlagReason_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSharingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sprint 3 spec §2.6, §3.5: an officer decision names its officer and holds a
-- justification; a system decision is an approval only, made by nobody, with
-- the check report in place of a justification. So the system can never
-- record a rejection (AGENTS.md -> Access rules 7). Existing rows are officer
-- decisions and already satisfy this.
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_maker_shape" CHECK (
  ("madeBy" = 'OFFICER' AND "decidedById" IS NOT NULL AND "justification" IS NOT NULL)
  OR
  ("madeBy" = 'SYSTEM' AND "outcome" = 'APPROVED' AND "decidedById" IS NULL AND "justification" IS NULL AND "report" IS NOT NULL)
);
