import "server-only";
import { Status } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isConfigured } from "@/lib/env";
import { processG1Job } from "@/lib/ai/triage";
import { processG2Job } from "@/lib/ai/fixCheck";
import { recomputeIssuePriority } from "@/lib/jobs/priorityRecompute";
import { syncWeatherForecast } from "@/lib/jobs/weather";
import { runTrafficSample } from "@/lib/jobs/trafficSample";
import { runDurability } from "@/lib/jobs/durability";
import { runTrafficProfileJob } from "@/lib/jobs/trafficProfile";
import { runDailyInsightsJob } from "@/lib/insights/deterioration";
import { runAiAssessJob } from "@/lib/ai/analyst";
import { sanitizeErrorMessage } from "@/lib/api/errors";

/** Each run must finish well inside a serverless function's time limit. */
const TIME_BUDGET_MS = 40_000;

/** Pilot corridor centre (ORR, Marathahalli–Kadubeesanahalli); used as the default weather point. */
const PILOT_WEATHER_POINT = { key: "pilot", lat: 12.9575, lng: 77.7011 };

/** Statuses where the desk still owes action, so the SLA clock is running. */
const SLA_ACTIVE_STATUSES: Status[] = [
  Status.OPEN,
  Status.CONFIRMED,
  Status.ASSIGNED,
  Status.IN_PROGRESS,
  Status.DISPUTED,
];

export const JOB_NAMES = [
  "sla-check",
  "ai-queue",
  "weather",
  "priority-recompute",
  "traffic-sample",
  "durability",
  "traffic-profile",
  "insights",
  "ai-assess",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobResult {
  job: JobName;
  processed: number;
  skipped?: string | number;
  remaining?: number;
  failed?: number;
  firstError?: string;
  durationMs: number;
}

function budgetLeft(startedAt: number): boolean {
  return Date.now() - startedAt < TIME_BUDGET_MS;
}

/** F5: marks issues whose SLA deadline has passed and logs it once per issue. */
async function runSlaCheck(startedAt: number): Promise<Omit<JobResult, "job" | "durationMs">> {
  const overdue = await prisma.issue.findMany({
    where: {
      slaBreached: false,
      slaDueAt: { lt: new Date() },
      status: { in: SLA_ACTIVE_STATUSES },
    },
    select: { id: true, status: true },
    take: 200,
  });

  let processed = 0;
  for (const issue of overdue) {
    if (!budgetLeft(startedAt)) break;
    await prisma.$transaction([
      prisma.issue.update({ where: { id: issue.id }, data: { slaBreached: true } }),
      prisma.actionLog.create({
        data: {
          issueId: issue.id,
          actorId: "system",
          action: "SYSTEM_SLA",
          note: "SLA deadline passed without the issue being fixed",
          fromStatus: issue.status,
          toStatus: issue.status,
        },
      }),
    ]);
    processed++;
  }
  return { processed };
}

/**
 * Processes queued AI jobs (G1 photo triage, G2 fix-check).
 * Without any LLM key the jobs stay queued, so they run with real AI once keys are added
 * instead of being "completed" with rules-only answers.
 */
async function runAiQueue(startedAt: number): Promise<Omit<JobResult, "job" | "durationMs">> {
  if (!isConfigured("GEMINI_API_KEY") && !isConfigured("GROQ_API_KEY")) {
    return { processed: 0, skipped: "No LLM key set (GEMINI_API_KEY / GROQ_API_KEY); jobs left queued" };
  }

  // Recover jobs left "processing" by a run that was cut off.
  await prisma.aiJob.updateMany({
    where: { status: "processing", createdAt: { lt: new Date(Date.now() - 15 * 60_000) }, attempts: { lt: 3 } },
    data: { status: "queued" },
  });

  const jobs = await prisma.aiJob.findMany({
    where: { status: "queued", feature: { in: ["G1", "G2"] }, attempts: { lt: 3 } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let processed = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const job of jobs) {
    if (!budgetLeft(startedAt)) break;
    const res = job.feature === "G1" ? await processG1Job(job.id) : await processG2Job(job.id);
    if (res.ok) {
      if (!res.skipped) {
        processed++;
      }
    } else {
      failed++;
      if (!firstError && res.error) {
        firstError = sanitizeErrorMessage(res.error);
      }
    }
  }
  return {
    processed,
    failed,
    ...(firstError ? { firstError } : {}),
  };
}

/** I1/M5: refreshes the 72-hour forecast for the pilot point and every imported ward. */
async function runWeather(startedAt: number): Promise<Omit<JobResult, "job" | "durationMs">> {
  const points: Array<{ key: string; lat: number; lng: number }> = [PILOT_WEATHER_POINT];

  const wards = await prisma
    .$queryRaw<Array<{ id: string; lat: number; lng: number }>>`
      SELECT id,
             ST_Y(ST_Centroid(geom::geometry)) AS lat,
             ST_X(ST_Centroid(geom::geometry)) AS lng
      FROM "Ward"
      WHERE geom IS NOT NULL
    `
    .catch(() => []);

  for (const w of wards) {
    if (Number.isFinite(w.lat) && Number.isFinite(w.lng)) {
      points.push({ key: w.id, lat: Number(w.lat), lng: Number(w.lng) });
    }
  }

  let processed = 0;
  let failed = 0;
  for (const p of points) {
    if (!budgetLeft(startedAt)) break;
    try {
      await syncWeatherForecast(p.key, p.lat, p.lng);
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}

/** M4: recomputes the Priority Index for open issues, least recently updated first. */
async function runPriorityRecompute(startedAt: number): Promise<Omit<JobResult, "job" | "durationMs">> {
  const issues = await prisma.issue.findMany({
    where: { status: { notIn: [Status.VERIFIED_FIXED, Status.REJECTED] } },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
    take: 300,
  });

  let processed = 0;
  let failed = 0;
  for (const issue of issues) {
    if (!budgetLeft(startedAt)) break;
    try {
      await recomputeIssuePriority(issue.id);
      processed++;
    } catch {
      failed++;
    }
  }
  return { processed, failed };
}

export async function runJob(name: JobName): Promise<JobResult> {
  const startedAt = Date.now();
  let result: Omit<JobResult, "job" | "durationMs">;

  switch (name) {
    case "sla-check":
      result = await runSlaCheck(startedAt);
      break;
    case "ai-queue":
      result = await runAiQueue(startedAt);
      break;
    case "weather":
      result = await runWeather(startedAt);
      break;
    case "priority-recompute":
      result = await runPriorityRecompute(startedAt);
      break;
    case "traffic-sample":
      result = await runTrafficSample(startedAt, TIME_BUDGET_MS);
      break;
    case "durability":
      result = await runDurability(startedAt, TIME_BUDGET_MS);
      break;
    case "traffic-profile":
      result = await runTrafficProfileJob(startedAt, TIME_BUDGET_MS);
      break;
    case "insights": {
      const insightsResult = await runDailyInsightsJob();
      result = { processed: insightsResult.assessedIssuesCount, failed: 0 };
      break;
    }
    case "ai-assess": {
      const assessResult = await runAiAssessJob(startedAt, TIME_BUDGET_MS);
      result = {
        processed: assessResult.processed,
        skipped: assessResult.skipped,
        remaining: assessResult.remaining,
        failed: assessResult.failed,
        firstError: assessResult.firstError,
      };
      break;
    }
    default:
      throw new Error(`Unknown job: ${String(name)}`);
  }

  return { job: name, ...result, durationMs: Date.now() - startedAt };
}
