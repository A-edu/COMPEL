-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COMPLIANCE_OFFICER';

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'APPROVED';
ALTER TYPE "RequestStatus" ADD VALUE 'REJECTED';

-- CreateTable
CREATE TABLE "FlagReason" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlagReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlagReason_requestId_idx" ON "FlagReason"("requestId");

-- AddForeignKey
ALTER TABLE "FlagReason" ADD CONSTRAINT "FlagReason_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSharingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
