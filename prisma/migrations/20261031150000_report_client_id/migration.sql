-- Idempotent report submission: a retried or re-synced report with the same client id is stored once.
ALTER TABLE "Report" ADD COLUMN "clientReportId" TEXT;
CREATE UNIQUE INDEX "Report_clientReportId_key" ON "Report"("clientReportId");
