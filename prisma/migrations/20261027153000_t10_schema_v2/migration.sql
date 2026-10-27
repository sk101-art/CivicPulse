DO $$ BEGIN
  CREATE TYPE "Band" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvidenceRole" AS ENUM ('REPORT', 'CONFIRM', 'CLAIM_FIX', 'VERIFY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SegmentEventType" AS ENUM ('REPORTED', 'VERIFIED_FIX', 'RESURFACED', 'ROAD_CUT', 'WATERLOGGED', 'RECURRENCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'WATERLOGGING';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'FOOTPATH';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'ROAD_CUT';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'TREE_FALL';

-- AlterEnum
CREATE TYPE "Status_new" AS ENUM ('OPEN', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'CLAIMED_FIXED', 'VERIFIED_FIXED', 'DISPUTED', 'REJECTED');
ALTER TABLE "public"."Report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Report" ALTER COLUMN "status" TYPE "Status_new" USING ("status"::text::"Status_new");
ALTER TYPE "Status" RENAME TO "Status_old";
ALTER TYPE "Status_new" RENAME TO "Status";
DROP TYPE "public"."Status_old";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_reportId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_reportId_fkey";

-- DropForeignKey
ALTER TABLE "Personnel" DROP CONSTRAINT "Personnel_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "PointLog" DROP CONSTRAINT "PointLog_reportId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_citizenId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_citizenId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_reportId_fkey";

-- AlterTable
ALTER TABLE "Assignment" DROP COLUMN "reportId",
ADD COLUMN     "issueId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "reportId",
ADD COLUMN     "issueId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Personnel" DROP COLUMN "departmentId";

-- AlterTable
ALTER TABLE "PointLog" DROP COLUMN "reportId";

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "address",
DROP COLUMN "assignedAt",
DROP COLUMN "category",
DROP COLUMN "citizenId",
DROP COLUMN "confirmedAt",
DROP COLUMN "confirmedBy",
DROP COLUMN "departmentId",
DROP COLUMN "description",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "priorityScore",
DROP COLUMN "rejectedAt",
DROP COLUMN "resolutionDesc",
DROP COLUMN "resolutionPhoto",
DROP COLUMN "resolvedAt",
DROP COLUMN "slaBreached",
DROP COLUMN "startedAt",
DROP COLUMN "status",
DROP COLUMN "title",
DROP COLUMN "updatedAt",
ADD COLUMN     "aiTriage" JSONB,
ADD COLUMN     "capturedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "deviceKeyId" TEXT,
ADD COLUMN     "gpsAccuracyM" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "isSeed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issueId" TEXT NOT NULL,
ADD COLUMN     "lat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "legacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lng" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "nonce" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "noteEnglish" TEXT,
ADD COLUMN     "noteLang" TEXT,
ADD COLUMN     "offline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoSha256" TEXT NOT NULL,
ADD COLUMN     "role" "EvidenceRole" NOT NULL,
ADD COLUMN     "signature" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "photoUrl" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "departmentId";

-- DropTable
DROP TABLE "Department";

-- DropTable
DROP TABLE "Vote";

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slaHours" INTEGER NOT NULL DEFAULT 72,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geom" geography(MultiPolygon,4326),

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadSegment" (
    "id" TEXT NOT NULL,
    "osmWayId" BIGINT NOT NULL,
    "name" TEXT,
    "roadClass" TEXT NOT NULL,
    "lanes" INTEGER,
    "busesPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pedestrianEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nearSchoolOrHospital" BOOLEAN NOT NULL DEFAULT false,
    "soleAccess" BOOLEAN NOT NULL DEFAULT false,
    "wardId" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT false,
    "geom" geography(LineString,4326),

    CONSTRAINT "RoadSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'OPEN',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geom" geography(Point,4326),
    "address" TEXT,
    "wardId" TEXT,
    "segmentId" TEXT,
    "agencyId" TEXT,
    "handoffCount" INTEGER NOT NULL DEFAULT 0,
    "sizeClass" TEXT,
    "lanePosition" TEXT,
    "blockedShare" TEXT NOT NULL DEFAULT 'none',
    "hazardFlag" TEXT,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "band" "Band" NOT NULL DEFAULT 'LOW',
    "piBreakdown" JSONB,
    "piText" TEXT,
    "bandOverride" "Band",
    "bandOverrideNote" TEXT,
    "recurrenceOf" TEXT,
    "needsDuplicateReview" BOOLEAN NOT NULL DEFAULT false,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicJwk" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceNonce" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "EvidenceNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "reportId" TEXT,
    "fromStatus" "Status",
    "toStatus" "Status",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "verifierId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentEvent" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "type" "SegmentEventType" NOT NULL,
    "agency" TEXT,
    "contractor" TEXT,
    "workOrder" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SegmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficSample" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "currentSpeed" DOUBLE PRECISION NOT NULL,
    "freeFlowSpeed" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrafficSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" TEXT NOT NULL,
    "pointKey" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "precipMm" DOUBLE PRECISION NOT NULL,
    "precipProb" DOUBLE PRECISION NOT NULL,
    "tempC" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "placeText" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geom" geography(Point,4326),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVer" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "geomJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_code_key" ON "Agency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ward_code_key" ON "Ward"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceNonce_value_key" ON "EvidenceNonce"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_issueId_verifierId_key" ON "Verification"("issueId", "verifierId");

-- CreateIndex
CREATE INDEX "TrafficSample_segmentId_sampledAt_idx" ON "TrafficSample"("segmentId", "sampledAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherForecast_pointKey_hour_key" ON "WeatherForecast"("pointKey", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_sourceUrl_key" ON "Signal"("sourceUrl");

-- CreateIndex
CREATE INDEX "AiJob_status_feature_idx" ON "AiJob"("status", "feature");

-- CreateIndex
CREATE INDEX "AiRun_feature_inputHash_idx" ON "AiRun"("feature", "inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "Report_nonce_key" ON "Report"("nonce");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentEvent" ADD CONSTRAINT "SegmentEvent_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficSample" ADD CONSTRAINT "TrafficSample_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- PostGIS Triggers and GiST indexes (T10 / Rule 15, 16, 18)

-- 1. Issue geom trigger
CREATE OR REPLACE FUNCTION issue_update_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_update_geom ON "Issue";
CREATE TRIGGER trg_issue_update_geom
BEFORE INSERT OR UPDATE OF lat, lng ON "Issue"
FOR EACH ROW
EXECUTE FUNCTION issue_update_geom();

-- 2. Signal geom trigger
CREATE OR REPLACE FUNCTION signal_update_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_signal_update_geom ON "Signal";
CREATE TRIGGER trg_signal_update_geom
BEFORE INSERT OR UPDATE OF lat, lng ON "Signal"
FOR EACH ROW
EXECUTE FUNCTION signal_update_geom();

-- 3. GiST indexes on all geom columns
CREATE INDEX IF NOT EXISTS "idx_issue_geom" ON "Issue" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "idx_roadsegment_geom" ON "RoadSegment" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "idx_ward_geom" ON "Ward" USING GIST ("geom");
CREATE INDEX IF NOT EXISTS "idx_signal_geom" ON "Signal" USING GIST ("geom");

-- 4. ActionLog append-only enforcement (Rule 18)
CREATE OR REPLACE FUNCTION action_log_prevent_modify()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionLog is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_action_log_prevent_modify ON "ActionLog";
CREATE TRIGGER trg_action_log_prevent_modify
BEFORE UPDATE OR DELETE ON "ActionLog"
FOR EACH ROW
EXECUTE FUNCTION action_log_prevent_modify();
