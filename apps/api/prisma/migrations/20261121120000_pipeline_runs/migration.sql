-- CreateEnum
CREATE TYPE "PipelineRunTrigger" AS ENUM ('RESPONSE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "PipelineRunState" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'UNDER_AUTOMATED_REVIEW';

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "trigger" "PipelineRunTrigger" NOT NULL,
    "state" "PipelineRunState" NOT NULL DEFAULT 'QUEUED',
    "models" JSONB NOT NULL,
    "ruleSetVersion" TEXT NOT NULL,
    "nextStep" INTEGER NOT NULL DEFAULT 0,
    "stepResults" JSONB NOT NULL DEFAULT '{}',
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineRun_requestId_idx" ON "PipelineRun"("requestId");

-- CreateIndex
CREATE INDEX "PipelineRun_state_idx" ON "PipelineRun"("state");

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSharingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

