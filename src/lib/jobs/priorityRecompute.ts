import { prisma } from "@/lib/db/prisma";
import { computePriority, PriorityInputs } from "@/lib/priority";
import { PRIORITY_CONFIG } from "@/config/priority";
import { Band } from "@prisma/client";

/**
 * Recomputes the Priority Index (PI), Band, Breakdown, and Sentence Facts for a single issue.
 * Called on new evidence ingestion, status change, or hourly background recomputation.
 */
export async function recomputeIssuePriority(issueId: string): Promise<number> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      agency: { select: { slaHours: true } },
      segment: true,
      reports: {
        select: {
          userId: true,
          role: true,
          offline: true,
        },
      },
    },
  });

  if (!issue) {
    throw new Error(`Issue not found for priority recomputation: ${issueId}`);
  }

  // Calculate age in hours
  const now = new Date();
  const ageHours = Math.max(0, (now.getTime() - issue.createdAt.getTime()) / (3600 * 1000));
  const slaHours = issue.agency?.slaHours ?? PRIORITY_CONFIG.defaultSlaHours;

  // Check weather forecast for rain in next 72 hours
  const pointKey = issue.wardId || "pilot";
  const rainRows = await prisma.weatherForecast.findMany({
    where: {
      pointKey,
      hour: {
        gte: now,
        lte: new Date(now.getTime() + 72 * 3600 * 1000),
      },
    },
    select: { precipMm: true },
  });
  const forecastRainMm72h = rainRows.reduce((sum, r) => sum + r.precipMm, 0);

  // Check nearby dark streetlights within 50m if PostGIS available
  let hasOpenDarkStreetlight50m = false;
  if (issue.lat && issue.lng) {
    const darkNearby = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Issue"
      WHERE category = 'STREETLIGHTS'::"Category"
        AND status NOT IN ('VERIFIED_FIXED'::"Status", 'REJECTED'::"Status")
        AND id != ${issue.id}
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${issue.lng}, ${issue.lat}), 4326)::geography, 50)
      LIMIT 1;
    `.catch(() => []);
    hasOpenDarkStreetlight50m = darkNearby.length > 0;
  }

  const priorityInputs: PriorityInputs = {
    category: issue.category,
    sizeClass: issue.sizeClass,
    lanePosition: issue.lanePosition,
    blockedShare: issue.blockedShare,
    roadClass: issue.segment?.roadClass,
    lanes: issue.segment?.lanes,
    busesPerHour: issue.segment?.busesPerHour,
    nearSchoolOrHospital: issue.segment?.nearSchoolOrHospital,
    soleAccess: issue.segment?.soleAccess,
    hasOpenDarkStreetlight50m,
    ageHours,
    slaHours,
    recurrences: issue.recurrenceOf ? 1 : 0,
    evidenceList: issue.reports.map((r) => ({
      userId: r.userId,
      role: r.role,
      offline: r.offline,
    })),
    forecastRainMm72h,
  };

  const result = computePriority(priorityInputs, PRIORITY_CONFIG, now);

  // Map Band string to Prisma Band enum
  const bandEnum = result.band as Band;

  await prisma.issue.update({
    where: { id: issue.id },
    data: {
      priority: result.pi,
      band: bandEnum,
      piBreakdown: result.breakdown as unknown as object,
      piText: result.sentenceFacts.summary,
    },
  });

  return result.pi;
}

/**
 * Recomputes Priority Index for all open issues.
 */
export async function recomputeAllOpenIssuesPriority(): Promise<number> {
  const openIssues = await prisma.issue.findMany({
    where: {
      status: {
        notIn: ["VERIFIED_FIXED", "REJECTED"],
      },
    },
    select: { id: true },
  });

  for (const item of openIssues) {
    await recomputeIssuePriority(item.id);
  }

  return openIssues.length;
}
