import { prisma } from "@/lib/db/prisma";
import { Status } from "@prisma/client";
import { getFlowSegment } from "@/lib/external/tomtom";
import { calculateCongestionR, getHourOfWeekIST } from "@/lib/traffic/congestion";
import { isConfigured } from "@/lib/env";

export const DAILY_TOMTOM_BUDGET = 1500;

export interface TrafficSampleJobResult {
  processed: number;
  skipped?: string;
  failed?: number;
}

/**
 * Scheduled job: traffic-sample
 * Samples top 40 open issues by Priority Index plus any ASSIGNED or CLAIMED issues.
 * Stays strictly within daily budget of 1,500 TomTom calls.
 * Skips issues already sampled for the current hourOfWeek in the last 7 days.
 */
export async function runTrafficSample(
  startedAt: number,
  timeBudgetMs: number = 40_000
): Promise<TrafficSampleJobResult> {
  const budgetLeft = () => Date.now() - startedAt < timeBudgetMs;

  if (!isConfigured("TOMTOM_API_KEY")) {
    return {
      processed: 0,
      skipped: "TOMTOM_API_KEY not configured; traffic sampling skipped",
    };
  }

  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );

  // Check calls made today against daily budget
  const samplesToday = await prisma.trafficSample.count({
    where: {
      sampledAt: { gte: startOfDay },
      isSeed: false,
    },
  });

  if (samplesToday >= DAILY_TOMTOM_BUDGET) {
    return {
      processed: 0,
      skipped: `Daily TomTom budget reached (${samplesToday}/${DAILY_TOMTOM_BUDGET})`,
    };
  }

  const remainingDailyBudget = DAILY_TOMTOM_BUDGET - samplesToday;

  // 1. Top 40 open issues by Priority Index
  const openIssues = await prisma.issue.findMany({
    where: { status: Status.OPEN },
    orderBy: { priority: "desc" },
    take: 40,
    select: {
      id: true,
      lat: true,
      lng: true,
      segmentId: true,
      priority: true,
      status: true,
    },
  });

  // 2. Plus any ASSIGNED or CLAIMED_FIXED issues
  const activeIssues = await prisma.issue.findMany({
    where: {
      status: { in: [Status.ASSIGNED, Status.CLAIMED_FIXED] },
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      segmentId: true,
      priority: true,
      status: true,
    },
  });

  // Deduplicate issues
  const candidateMap = new Map<string, typeof openIssues[0]>();
  for (const issue of openIssues) {
    candidateMap.set(issue.id, issue);
  }
  for (const issue of activeIssues) {
    candidateMap.set(issue.id, issue);
  }

  const candidates = Array.from(candidateMap.values());
  if (candidates.length === 0) {
    return { processed: 0, skipped: "No open or claimed/assigned issues found" };
  }

  // 3. Skip issues sampled for the same hourOfWeek in the last 7 days
  const currentHourOfWeek = getHourOfWeekIST(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const candidateIds = candidates.map((c) => c.id);
  const recentlySampled = await prisma.trafficSample.findMany({
    where: {
      issueId: { in: candidateIds },
      hourOfWeek: currentHourOfWeek,
      sampledAt: { gte: sevenDaysAgo },
    },
    select: { issueId: true },
  });

  const recentlySampledSet = new Set(
    recentlySampled.map((s) => s.issueId).filter(Boolean)
  );

  const eligibleIssues = candidates.filter(
    (c) => !recentlySampledSet.has(c.id)
  );

  let processed = 0;
  let failed = 0;

  for (const issue of eligibleIssues) {
    if (processed >= remainingDailyBudget || !budgetLeft()) {
      break;
    }

    try {
      const flow = await getFlowSegment(issue.lat, issue.lng);
      if (!flow) {
        // Missing key, quota hit, or outside India
        continue;
      }

      const congestionR = calculateCongestionR(
        flow.currentSpeed,
        flow.freeFlowSpeed
      );

      await prisma.trafficSample.create({
        data: {
          issueId: issue.id,
          segmentId: issue.segmentId ?? undefined,
          sampledAt: now,
          hourOfWeek: currentHourOfWeek,
          currentSpeed: flow.currentSpeed,
          freeFlowSpeed: flow.freeFlowSpeed,
          congestionR,
          frc: flow.frc,
          confidence: flow.confidence,
          isSeed: false,
        },
      });

      processed++;
    } catch {
      failed++;
    }
  }

  return {
    processed,
    ...(failed > 0 ? { failed } : {}),
  };
}
