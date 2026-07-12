-- AlterEnum
ALTER TYPE "LeadSourceType" ADD VALUE 'LEAD_HUNTER';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "googlePlaceId" TEXT,
ADD COLUMN     "leadHunterExecutionId" TEXT;

-- CreateIndex
CREATE INDEX "leads_googlePlaceId_idx" ON "leads"("googlePlaceId");

-- CreateIndex
CREATE INDEX "leads_leadHunterExecutionId_idx" ON "leads"("leadHunterExecutionId");
