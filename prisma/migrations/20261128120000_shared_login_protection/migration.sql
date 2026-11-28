CREATE TABLE "LoginAttemptBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LoginAttemptBucket_expiresAt_idx" ON "LoginAttemptBucket"("expiresAt");
