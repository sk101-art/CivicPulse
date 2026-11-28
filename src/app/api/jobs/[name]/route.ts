import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiError, sanitizeErrorMessage } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { JOB_NAMES, runJob, type JobName } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
// Jobs keep their own 40 s budget; allow some headroom on the platform side.
export const maxDuration = 60;

function secretMatches(provided: string | null): boolean {
  const expected = env.JOB_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Scheduled job endpoint, called by GitHub Actions (.github/workflows/jobs.yml).
 * Requires header `x-job-secret` equal to JOB_SECRET.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!env.JOB_SECRET) {
    return apiError(503, "JOBS_DISABLED", "JOB_SECRET is not configured on the server");
  }

  if (!secretMatches(req.headers.get("x-job-secret"))) {
    return apiError(401, "UNAUTHORIZED", "Invalid or missing job secret");
  }

  const { name } = await params;
  if (!(JOB_NAMES as readonly string[]).includes(name)) {
    return apiError(404, "UNKNOWN_JOB", `Unknown job '${name}'. Known jobs: ${JOB_NAMES.join(", ")}`);
  }

  const startedAt = new Date();
  const runRecord = await prisma.scheduledJobRun.create({
    data: { job: name, status: "RUNNING", startedAt },
  }).catch((error: unknown) => {
    // Job execution must continue if telemetry storage is temporarily unavailable.
    console.warn("Unable to create scheduled job telemetry row:", sanitizeErrorMessage(error instanceof Error ? error.message : "Telemetry storage unavailable"));
    return null;
  });

  try {
    const result = await runJob(name as JobName);
    if (runRecord) {
      const status = result.partial
        ? "PARTIAL"
        : result.failed
          ? "DEGRADED"
          : result.skipped
            ? "SKIPPED"
            : "SUCCEEDED";
      const skipNote = result.skipped == null ? null : sanitizeErrorMessage(String(result.skipped)).slice(0, 300);
      const summary = result.firstError ?? skipNote;
      await prisma.scheduledJobRun.update({
        where: { id: runRecord.id },
        data: {
          status,
          finishedAt: new Date(),
          processed: result.processed,
          failed: result.failed ?? 0,
          skipped: skipNote,
          remaining: result.remaining ?? null,
          partial: result.partial ?? false,
          durationMs: result.durationMs,
          summary: summary ? sanitizeErrorMessage(summary).slice(0, 500) : null,
        },
      }).catch((error: unknown) => {
        console.warn("Unable to update scheduled job telemetry row:", sanitizeErrorMessage(error instanceof Error ? error.message : "Telemetry storage unavailable"));
      });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(`Job ${name} failed:`, sanitizeErrorMessage(error instanceof Error ? error.message : "Job failed"));
    if (runRecord) {
      await prisma.scheduledJobRun.update({
        where: { id: runRecord.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          failed: 1,
          summary: sanitizeErrorMessage(error instanceof Error ? error.message : "Job failed").slice(0, 500),
        },
      }).catch((telemetryError: unknown) => {
        console.warn("Unable to record scheduled job failure:", sanitizeErrorMessage(telemetryError instanceof Error ? telemetryError.message : "Telemetry storage unavailable"));
      });
    }
    return apiError(500, "JOB_FAILED", `Job '${name}' failed`);
  }
}
