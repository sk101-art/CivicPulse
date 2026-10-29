-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditKind" AS ENUM ('CLAIM_CHECK', 'DURABILITY', 'CONTROL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditTaskStatus" AS ENUM ('OPEN', 'DONE', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditObserved" AS ENUM ('INTACT', 'DAMAGED', 'CANNOT_SEE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "EvidenceRole" ADD VALUE IF NOT EXISTS 'AUDIT';

-- AlterEnum
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'REOPENED_IN_WARRANTY';

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "contractorName" TEXT,
ADD COLUMN IF NOT EXISTS "lifespanDays" INTEGER,
ADD COLUMN IF NOT EXISTS "repairClaimedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "tenderId" TEXT,
ADD COLUMN IF NOT EXISTS "warrantyUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "headingDeg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditTask" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "kind" "AuditKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "challengeBearingDeg" INTEGER NOT NULL,
    "challengeNonce" TEXT NOT NULL,
    "status" "AuditTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reportId" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditVote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "observed" "AuditObserved" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditorScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "controlsPassed" INTEGER NOT NULL DEFAULT 0,
    "controlsTotal" INTEGER NOT NULL DEFAULT 0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditTask_issueId_status_idx" ON "AuditTask"("issueId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditTask_assigneeId_status_idx" ON "AuditTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditTask_status_dueAt_idx" ON "AuditTask"("status", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditTask_kind_status_idx" ON "AuditTask"("kind", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditVote_taskId_idx" ON "AuditVote"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditVote_userId_idx" ON "AuditVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AuditVote_taskId_userId_key" ON "AuditVote"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AuditorScore_userId_key" ON "AuditorScore"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AuditTask" ADD CONSTRAINT "AuditTask_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditTask" ADD CONSTRAINT "AuditTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditTask" ADD CONSTRAINT "AuditTask_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditVote" ADD CONSTRAINT "AuditVote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AuditTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditVote" ADD CONSTRAINT "AuditVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditorScore" ADD CONSTRAINT "AuditorScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
