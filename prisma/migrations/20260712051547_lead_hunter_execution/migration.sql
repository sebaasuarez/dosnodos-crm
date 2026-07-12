-- CreateEnum
CREATE TYPE "LeadHunterExecutionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadHunterTriggerType" AS ENUM ('CRON', 'MANUAL');

-- CreateTable
CREATE TABLE "lead_hunter_executions" (
    "id" TEXT NOT NULL,
    "status" "LeadHunterExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "triggerType" "LeadHunterTriggerType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "queriesExecuted" INTEGER NOT NULL DEFAULT 0,
    "rawResults" INTEGER NOT NULL DEFAULT 0,
    "validResults" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "batchLabel" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_hunter_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_hunter_executions_status_idx" ON "lead_hunter_executions"("status");

-- CreateIndex
CREATE INDEX "lead_hunter_executions_startedAt_idx" ON "lead_hunter_executions"("startedAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_leadHunterExecutionId_fkey" FOREIGN KEY ("leadHunterExecutionId") REFERENCES "lead_hunter_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
