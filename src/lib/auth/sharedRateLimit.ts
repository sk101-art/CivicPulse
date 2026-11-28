import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Reserve the attempt atomically before password verification. The fixed window
// starts on the first attempt and is shared across warm and cold server instances.
export async function reserveLoginAttempt(identifier: string) {
  const key = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
  const rows = await prisma.$queryRaw<Array<{ attempts: number; expiresAt: Date }>>`
    INSERT INTO "LoginAttemptBucket" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginAttemptBucket"."expiresAt" <= NOW() THEN 1 ELSE "LoginAttemptBucket"."attempts" + 1 END,
      "expiresAt" = CASE WHEN "LoginAttemptBucket"."expiresAt" <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "LoginAttemptBucket"."expiresAt" END
    RETURNING "attempts", "expiresAt" AT TIME ZONE 'UTC' AS "expiresAt"
  `;
  const row = rows[0];
  return {
    allowed: row.attempts <= MAX_ATTEMPTS,
    retryAfterSeconds: Math.max(1, Math.min(WINDOW_MS / 1000, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000))),
  };
}

export async function clearLoginAttempts(identifier: string) {
  const key = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
  await prisma.$executeRaw`DELETE FROM "LoginAttemptBucket" WHERE "key" = ${key}`;
}
