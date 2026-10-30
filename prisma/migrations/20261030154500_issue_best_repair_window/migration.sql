-- AlterTable
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "bestRepairWindow" JSONB;
