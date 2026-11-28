CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" TEXT,
    "remaining" INTEGER,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "summary" TEXT,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledJobRun_job_startedAt_idx" ON "ScheduledJobRun"("job", "startedAt");
CREATE INDEX "ScheduledJobRun_status_startedAt_idx" ON "ScheduledJobRun"("status", "startedAt");
