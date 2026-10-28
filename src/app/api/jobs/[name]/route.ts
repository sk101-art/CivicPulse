import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiError } from "@/lib/api/errors";
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

  try {
    const result = await runJob(name as JobName);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(`Job ${name} failed:`, error instanceof Error ? error.message : error);
    return apiError(500, "JOB_FAILED", `Job '${name}' failed`);
  }
}
