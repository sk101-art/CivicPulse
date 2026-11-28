import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const supplied = req.headers.get("x-job-secret");
  if (!env.JOB_SECRET || !supplied) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const a = Buffer.from(supplied), b = Buffer.from(env.JOB_SECRET);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [weather, traffic, jobs] = await Promise.all([
      prisma.weatherForecast.aggregate({ _max: { fetchedAt: true } }),
      prisma.trafficSample.aggregate({ where: { isSeed: false }, _max: { sampledAt: true } }),
      prisma.scheduledJobRun.findMany({ where: { job: { in: ["weather", "traffic-sample"] } }, orderBy: { startedAt: "desc" }, distinct: ["job"] }),
    ]);
    const now = Date.now();
    const readings = [
      { source: "weather", observedAt: weather._max.fetchedAt, maxAgeMs: 3 * 3600000 },
      { source: "traffic-sample", observedAt: traffic._max.sampledAt, maxAgeMs: 4 * 3600000 },
    ];
    const feeds = readings.map((reading) => {
      const job = jobs.find((run) => run.job === reading.source);
      const stale = !reading.observedAt || now - reading.observedAt.getTime() > reading.maxAgeMs;
      const jobUnhealthy = !job || job.failed > 0 || job.partial || Boolean(job.skipped) || !["SUCCEEDED", "RUNNING"].includes(job.status) || (job.status === "RUNNING" && now - job.startedAt.getTime() > 120000);
      return { ...reading, stale, jobUnhealthy, latestJobStatus: job?.status ?? null, processed: job?.processed ?? null };
    });
    const healthy = feeds.every((feed) => !feed.stale && !feed.jobUnhealthy);
    return NextResponse.json({ healthy, checkedAt: new Date().toISOString(), scope: "Latest stored source observations; consult dashboard for per-location coverage", feeds }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ healthy: false, error: "Feed health could not be checked" }, { status: 503 });
  }
}
