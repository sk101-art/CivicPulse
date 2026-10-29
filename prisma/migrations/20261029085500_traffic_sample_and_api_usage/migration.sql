-- AlterTable TrafficSample
ALTER TABLE "TrafficSample" ALTER COLUMN "segmentId" DROP NOT NULL;
ALTER TABLE "TrafficSample" ADD COLUMN IF NOT EXISTS "issueId" TEXT;
ALTER TABLE "TrafficSample" ADD COLUMN IF NOT EXISTS "hourOfWeek" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TrafficSample" ADD COLUMN IF NOT EXISTS "congestionR" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TrafficSample" ADD COLUMN IF NOT EXISTS "frc" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrafficSample_issueId_hourOfWeek_idx" ON "TrafficSample"("issueId", "hourOfWeek");
CREATE INDEX IF NOT EXISTS "TrafficSample_issueId_sampledAt_idx" ON "TrafficSample"("issueId", "sampledAt");
CREATE INDEX IF NOT EXISTS "TrafficSample_sampledAt_idx" ON "TrafficSample"("sampledAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TrafficSample" ADD CONSTRAINT "TrafficSample_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable ApiUsage
CREATE TABLE IF NOT EXISTS "ApiUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiUsage_provider_month_key" ON "ApiUsage"("provider", "month");
CREATE INDEX IF NOT EXISTS "ApiUsage_provider_month_idx" ON "ApiUsage"("provider", "month");
