import "server-only";
import { prisma } from "@/lib/db/prisma";
import { reverseGeocode } from "@/lib/external/tomtom";

export interface GeocodeBackfillJobResult {
  processed: number;
  remaining: number;
  partial: boolean;
}

/**
 * Batched geocode backfill job ("geocode-backfill", max 25 per run).
 * Reverse-geocodes all open or existing issues with missing, placeholder,
 * or raw coordinate titles ("Report Location", "Authority Pin").
 */
export async function runGeocodeBackfillJob(
  startedAt: number,
  timeBudgetMs: number = 40_000,
  tracker?: { processed: number; remaining: number }
): Promise<GeocodeBackfillJobResult> {
  const issuesNeedingBackfill = await prisma.issue.findMany({
    where: {
      OR: [
        { address: null },
        { address: { contains: "Report Location" } },
        { address: { contains: "Authority Pin" } },
        { address: "Bengaluru" },
        { address: "" },
      ],
    },
    take: 25,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      lat: true,
      lng: true,
      address: true,
    },
  });

  const totalRemainingCount = await prisma.issue.count({
    where: {
      OR: [
        { address: null },
        { address: { contains: "Report Location" } },
        { address: { contains: "Authority Pin" } },
        { address: "Bengaluru" },
        { address: "" },
      ],
    },
  });

  let processed = 0;

  for (const issue of issuesNeedingBackfill) {
    if (Date.now() - startedAt > timeBudgetMs - 15_000) {
      break;
    }

    try {
      const geo = await reverseGeocode(issue.lat, issue.lng);
      if (geo && geo.formatted && !geo.formatted.includes("Report Location")) {
        await prisma.issue.update({
          where: { id: issue.id },
          data: { address: geo.formatted },
        });
        processed++;
        if (tracker) tracker.processed = processed;
      }
    } catch (err) {
      console.error(`[geocode-backfill] Failed for issue ${issue.id}:`, err);
    }
  }

  const remaining = Math.max(0, totalRemainingCount - processed);
  if (tracker) tracker.remaining = remaining;

  return {
    processed,
    remaining,
    partial: remaining > 0,
  };
}
