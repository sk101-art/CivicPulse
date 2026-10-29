import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Status, ProfileSource } from "@prisma/client";
import { buildPlaceProfile, PROFILE_TTL_DAYS } from "@/lib/traffic/profile";
import {
  getDailyTomTomCallCount,
  MAX_DAILY_QUOTA,
} from "@/lib/external/tomtom";

const MAX_PLACES_PER_RUN = 25;

export interface TrafficProfileJobResult {
  processed: number;
  skipped?: string;
  failed?: number;
  firstError?: string;
}

/**
 * Scheduled job: "traffic-profile" (runs every 2h).
 * Builds 48-slot traffic profiles for up to 25 open issues per run, ordered by highest priority first.
 * Respects 1,200/day TomTom quota and 14-day profile validity.
 */
export async function runTrafficProfileJob(
  startedAt: number,
  timeBudgetMs: number = 40_000
): Promise<TrafficProfileJobResult> {
  const currentDailyCalls = await getDailyTomTomCallCount().catch(() => 0);
  if (currentDailyCalls >= MAX_DAILY_QUOTA) {
    return {
      processed: 0,
      skipped: `Daily TomTom quota reached (${currentDailyCalls}/${MAX_DAILY_QUOTA})`,
    };
  }

  const validSince = new Date(
    Date.now() - PROFILE_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  // Find candidate open issues ordered by highest priority first
  // Allow real non-seed issues OR seed DEMO issues (whose id starts with "seed-demo-")
  const openIssues = await prisma.issue.findMany({
    where: {
      status: {
        notIn: [Status.VERIFIED_FIXED, Status.REJECTED],
      },
      OR: [
        { isSeed: false },
        { id: { startsWith: "seed-demo-" } },
      ],
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      segmentId: true,
      priority: true,
      segment: {
        select: { roadClass: true },
      },
    },
    orderBy: { priority: "desc" },
    take: 100,
  });

  if (openIssues.length === 0) {
    return { processed: 0, skipped: "No open issues found" };
  }

  // Find existing profile counts within 14 days with real TomTom profiles
  const recentProfiles = await prisma.placeTrafficProfile.groupBy({
    by: ["issueId"],
    where: {
      issueId: { in: openIssues.map((i) => i.id) },
      fetchedAt: { gte: validSince },
      source: { in: [ProfileSource.TOMTOM_HISTORIC, ProfileSource.LIVE_SAMPLE] },
    },
    _count: { id: true },
  });

  const freshIssueIds = new Set(
    recentProfiles.filter((p) => p._count.id === 48).map((p) => p.issueId)
  );

  // Issues needing a profile
  const candidates = openIssues.filter((i) => !freshIssueIds.has(i.id));

  let processed = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const issue of candidates.slice(0, MAX_PLACES_PER_RUN)) {
    if (Date.now() - startedAt >= timeBudgetMs) {
      break;
    }

    try {
      await buildPlaceProfile(
        {
          id: issue.id,
          lat: issue.lat,
          lng: issue.lng,
          segmentId: issue.segmentId,
          roadClass: issue.segment?.roadClass,
        },
        issue.id.startsWith("seed-demo-")
      );
      processed++;
    } catch (err) {
      failed++;
      if (!firstError) {
        firstError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return { processed, failed, firstError };
}
