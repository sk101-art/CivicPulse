-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DayType" AS ENUM ('WEEKDAY', 'WEEKEND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProfileSource" AS ENUM ('TOMTOM_HISTORIC', 'LIVE_SAMPLE', 'ESTIMATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaceTrafficProfile" (
    "id" TEXT NOT NULL,
    "issueId" TEXT,
    "segmentId" TEXT,
    "direction" TEXT DEFAULT 'BOTH',
    "dayType" "DayType" NOT NULL,
    "hour" INTEGER NOT NULL,
    "delayRatio" DOUBLE PRECISION NOT NULL,
    "source" "ProfileSource" NOT NULL DEFAULT 'ESTIMATED',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceTrafficProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaceTrafficProfile_issueId_dayType_hour_idx" ON "PlaceTrafficProfile"("issueId", "dayType", "hour");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaceTrafficProfile_segmentId_dayType_hour_idx" ON "PlaceTrafficProfile"("segmentId", "dayType", "hour");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaceTrafficProfile_fetchedAt_idx" ON "PlaceTrafficProfile"("fetchedAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaceTrafficProfile_issueId_fkey'
  ) THEN
    ALTER TABLE "PlaceTrafficProfile" ADD CONSTRAINT "PlaceTrafficProfile_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaceTrafficProfile_segmentId_fkey'
  ) THEN
    ALTER TABLE "PlaceTrafficProfile" ADD CONSTRAINT "PlaceTrafficProfile_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
