-- AlterTable
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "insightsComputedAt" TIMESTAMP(3);
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "repairWindowInputHash" TEXT;
