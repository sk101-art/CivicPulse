-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DeteriorationRisk" AS ENUM ('LOW', 'MED', 'HIGH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "deteriorationRisk" "DeteriorationRisk",
ADD COLUMN IF NOT EXISTS "deteriorationScore" INTEGER,
ADD COLUMN IF NOT EXISTS "expectedDaysToWorsen" INTEGER,
ADD COLUMN IF NOT EXISTS "isHotspot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "deteriorationDrivers" JSONB;

-- AlterTable
ALTER TABLE "RoadSegment" ADD COLUMN IF NOT EXISTS "isHotspot" BOOLEAN NOT NULL DEFAULT false;
