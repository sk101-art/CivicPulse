import "server-only";
import { Band, Category, Prisma, Status } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { displayLocation } from "@/lib/issues/display";

export type BriefingPeriod = "7d" | "30d" | "90d" | "6m" | "all";

export interface AreaBriefingKpis {
  totalActiveIssues: number;
  highCriticalPriority: number;
  awaitingAssignment: number;
  slaAtRisk: number;
  slaBreached: number;
  recentlyResolved: number;
}

export interface AreaBriefingHotspot {
  id: string;
  locality: string;
  wardLabel: string;
  wardName: string;
  issueCount: number;
  dominantCategory: string;
  priorityLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  lat: number;
  lng: number;
}

export interface DispatchAllocationSuggestion {
  id: string;
  wardId: string | null;
  wardLabel: string;
  wardName: string;
  category: string;
  eligibleCount: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  suggestedAgency: string | null;
  reason: string;
  isSuggestion: true;
}

export interface AreaBriefingTelemetry {
  scope: {
    wardId: string | null;
    wardCode: string;
    wardName: string;
    corporationId: string | null;
    corporationName: string | null;
    period: BriefingPeriod;
  };
  kpis: AreaBriefingKpis;
  overview: {
    categoryDistribution: Array<{ category: string; label: string; count: number }>;
    awaitingVerification: number;
    reopenedIssues: number;
    disputedIssues: number;
    totalInPeriod: number;
  };
  hotspots: AreaBriefingHotspot[];
  issuesGeo: Array<{
    id: string;
    category: string;
    status: string;
    band: string;
    lat: number;
    lng: number;
    address: string | null;
  }>;
  dispatchSuggestions: DispatchAllocationSuggestion[];
  refreshedAt: string;
}

function getPeriodStart(period: BriefingPeriod, now: Date): Date | null {
  const dayMs = 24 * 3600 * 1000;
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * dayMs);
    case "30d":
      return new Date(now.getTime() - 30 * dayMs);
    case "90d":
      return new Date(now.getTime() - 90 * dayMs);
    case "6m":
      return new Date(now.getTime() - 180 * dayMs);
    case "all":
    default:
      return null;
  }
}

const BAND_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export async function loadAreaBriefingTelemetry(params: {
  wardCode?: string | null;
  wardId?: string | null;
  corporationId?: string | null;
  period?: BriefingPeriod;
}): Promise<AreaBriefingTelemetry> {
  const now = new Date();
  const period: BriefingPeriod = params.period || "30d";
  const startDate = getPeriodStart(period, now);

  const rawWardIdentifier = (params.wardId || params.wardCode || "ALL").trim();
  const lower = rawWardIdentifier.toLowerCase();
  const isAll = lower === "all" || lower === "zone-all" || lower === "";

  let targetWard: {
    id: string;
    code: string;
    name: string;
    wardNumber: number | null;
    corporationId: string | null;
    corporation: { id: string; name: string } | null;
  } | null = null;

  if (!isAll) {
    targetWard = await prisma.ward.findFirst({
      where: {
        OR: [
          { id: { equals: rawWardIdentifier, mode: "insensitive" } },
          { code: { equals: rawWardIdentifier, mode: "insensitive" } },
          { officialId: { equals: rawWardIdentifier, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        wardNumber: true,
        corporationId: true,
        corporation: { select: { id: true, name: true } },
      },
    });
  }

  let corpInfo: { id: string; name: string } | null = targetWard?.corporation ?? null;
  let wardFilterIds: string[] | undefined;

  if (targetWard) {
    wardFilterIds = [targetWard.id];
  } else if (params.corporationId && params.corporationId !== "ALL") {
    const corp = await prisma.corporation.findUnique({
      where: { id: params.corporationId },
      select: { id: true, name: true },
    });
    if (corp) corpInfo = corp;
    const corpWards = await prisma.ward.findMany({
      where: { corporationId: params.corporationId, isLegacy: false, isOperationalArea: false },
      select: { id: true },
    });
    wardFilterIds = corpWards.map((w) => w.id);
  }

  const where: Prisma.IssueWhereInput = {
    ...(wardFilterIds ? { wardId: { in: wardFilterIds } } : {}),
    ...(startDate ? { createdAt: { gte: startDate } } : {}),
  };
  const activeWhere: Prisma.IssueWhereInput = {
    ...where,
    status: { notIn: [Status.VERIFIED_FIXED, Status.REJECTED] },
  };
  const highOrCriticalWhere: Prisma.IssueWhereInput = {
    ...activeWhere,
    OR: [
      { bandOverride: { in: [Band.CRITICAL, Band.HIGH] } },
      { bandOverride: null, band: { in: [Band.CRITICAL, Band.HIGH] } },
    ],
  };

  const [issues, allWards, agencies, totalActiveIssues, highCriticalPriority,
    awaitingAssignment, slaAtRisk, slaBreached, recentlyResolved, totalInPeriod] = await Promise.all([
    prisma.issue.findMany({
      where,
      select: {
        id: true,
        category: true,
        status: true,
        band: true,
        bandOverride: true,
        priority: true,
        lat: true,
        lng: true,
        address: true,
        wardId: true,
        agencyId: true,
        slaDueAt: true,
        slaBreached: true,
        isHotspot: true,
        createdAt: true,
        agency: { select: { id: true, name: true } },
        assignments: { take: 1, select: { id: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.ward.findMany({
      select: { id: true, code: true, name: true, wardNumber: true },
    }),
    prisma.agency.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.issue.count({ where: activeWhere }),
    prisma.issue.count({ where: highOrCriticalWhere }),
    prisma.issue.count({ where: {
      ...activeWhere,
      agencyId: null,
      assignments: { none: {} },
    } }),
    prisma.issue.count({ where: {
      ...activeWhere,
      slaBreached: false,
      slaDueAt: { gte: now, lte: new Date(now.getTime() + 12 * 3600 * 1000) },
    } }),
    prisma.issue.count({ where: {
      ...activeWhere,
      OR: [{ slaBreached: true }, { slaDueAt: { lt: now } }],
    } }),
    prisma.issue.count({ where: { ...where, status: Status.VERIFIED_FIXED } }),
    prisma.issue.count({ where }),
  ]);

  const wardMap = new Map(allWards.map((w) => [w.id, w]));

  const isClosed = (s: Status) => s === Status.VERIFIED_FIXED || s === Status.REJECTED;
  const activeIssues = issues.filter((i) => !isClosed(i.status));

  const kpis: AreaBriefingKpis = {
    totalActiveIssues,
    highCriticalPriority,
    awaitingAssignment,
    slaAtRisk,
    slaBreached,
    recentlyResolved,
  };

  // Category distribution across active issues
  const catMap = new Map<string, number>();
  for (const i of activeIssues) {
    const cat = i.category || Category.OTHER;
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
  }
  const categoryDistribution = Array.from(catMap.entries())
    .map(([category, count]) => ({
      category,
      label: category.replace(/_/g, " "),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Geographical hotspots (~250m spatial clustering of real coordinates)
  const visited = new Set<string>();
  const hotspots: AreaBriefingHotspot[] = [];
  const CLUSTER_DEG = 0.0022;

  for (let i = 0; i < activeIssues.length; i++) {
    const a = activeIssues[i];
    if (visited.has(a.id) || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue;
    visited.add(a.id);
    const group = [a];
    for (let j = i + 1; j < activeIssues.length; j++) {
      const b = activeIssues[j];
      if (visited.has(b.id) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;
      if (Math.abs(a.lat - b.lat) <= CLUSTER_DEG && Math.abs(a.lng - b.lng) <= CLUSTER_DEG) {
        visited.add(b.id);
        group.push(b);
      }
    }

    const avgLat = group.reduce((s, it) => s + it.lat, 0) / group.length;
    const avgLng = group.reduce((s, it) => s + it.lng, 0) / group.length;
    const catCounts: Record<string, number> = {};
    let maxBand: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";

    for (const it of group) {
      catCounts[it.category] = (catCounts[it.category] || 0) + 1;
      const b = (it.bandOverride ?? it.band) as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      if ((BAND_RANK[b] || 0) > (BAND_RANK[maxBand] || 0)) {
        maxBand = b;
      }
    }
    const domCat = Object.entries(catCounts).sort((x, y) => y[1] - x[1])[0]?.[0] || "OTHER";
    const wInfo = a.wardId ? wardMap.get(a.wardId) : undefined;
    const wardLabel = wInfo
      ? wInfo.wardNumber != null
        ? `Ward ${wInfo.wardNumber}`
        : wInfo.code
      : "Unassigned Ward";

    hotspots.push({
      id: `hs-${a.id}`,
      locality: displayLocation(a.address, avgLat, avgLng),
      wardLabel,
      wardName: wInfo?.name?.replace(/\s*\(Demo\)/i, "").trim() || "Bengaluru Grid",
      issueCount: group.length,
      dominantCategory: domCat.replace(/_/g, " "),
      priorityLevel: maxBand,
      lat: avgLat,
      lng: avgLng,
    });
  }

  hotspots.sort(
    (a, b) =>
      b.issueCount - a.issueCount ||
      (BAND_RANK[b.priorityLevel] || 0) - (BAND_RANK[a.priorityLevel] || 0)
  );

  // Recommended Dispatch Allocations grounded in actual active issues
  const allocMap = new Map<
    string,
    {
      wardId: string | null;
      wardLabel: string;
      wardName: string;
      category: string;
      count: number;
      maxBand: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      unassignedCount: number;
      breachedCount: number;
    }
  >();

  for (const iss of activeIssues) {
    const wInfo = iss.wardId ? wardMap.get(iss.wardId) : undefined;
    const cat = iss.category || Category.OTHER;
    const key = `${iss.wardId || "unassigned"}::${cat}`;
    const b = (iss.bandOverride ?? iss.band) as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    const isUnassigned = iss.agencyId === null && iss.assignments.length === 0;
    const isBreached = iss.slaBreached || iss.slaDueAt < now;

    const existing = allocMap.get(key);
    if (existing) {
      existing.count++;
      if (isUnassigned) existing.unassignedCount++;
      if (isBreached) existing.breachedCount++;
      if ((BAND_RANK[b] || 0) > (BAND_RANK[existing.maxBand] || 0)) existing.maxBand = b;
    } else {
      allocMap.set(key, {
        wardId: iss.wardId,
        wardLabel: wInfo
          ? wInfo.wardNumber != null
            ? `Ward ${wInfo.wardNumber}`
            : wInfo.code
          : "Grid Sector",
        wardName: wInfo?.name?.replace(/\s*\(Demo\)/i, "").trim() || "Unassigned Area",
        category: cat,
        count: 1,
        maxBand: b,
        unassignedCount: isUnassigned ? 1 : 0,
        breachedCount: isBreached ? 1 : 0,
      });
    }
  }

  const defaultAgencyName = agencies[0]?.name || null;
  const dispatchSuggestions: DispatchAllocationSuggestion[] = Array.from(allocMap.entries())
    .map(([key, grp]) => ({
      id: key,
      wardId: grp.wardId,
      wardLabel: grp.wardLabel,
      wardName: grp.wardName,
      category: grp.category.replace(/_/g, " "),
      eligibleCount: grp.count,
      priority: grp.maxBand,
      suggestedAgency: defaultAgencyName,
      reason:
        grp.breachedCount > 0
          ? `${grp.breachedCount} overdue SLA ticket(s) and ${grp.unassignedCount} awaiting assignment.`
          : grp.unassignedCount > 0
            ? `${grp.unassignedCount} of ${grp.count} active issue(s) awaiting field assignment.`
            : `${grp.count} active ${grp.category.replace(/_/g, " ").toLowerCase()} defect(s) in queue.`,
      isSuggestion: true as const,
    }))
    .sort(
      (a, b) =>
        (BAND_RANK[b.priority] || 0) - (BAND_RANK[a.priority] || 0) ||
        b.eligibleCount - a.eligibleCount
    )
    .slice(0, 6);

  return {
    scope: {
      wardId: targetWard?.id ?? null,
      wardCode: targetWard?.code ?? "ALL",
      wardName: targetWard
        ? targetWard.wardNumber != null
          ? `Ward ${targetWard.wardNumber} · ${targetWard.name.replace(/\s*\(Demo\)/i, "").trim()}`
          : targetWard.name.replace(/\s*\(Demo\)/i, "").trim()
        : corpInfo
          ? `${corpInfo.name} · All Wards`
          : "All Assigned Wards",
      corporationId: corpInfo?.id ?? null,
      corporationName: corpInfo?.name ?? null,
      period,
    },
    kpis,
    overview: {
      categoryDistribution,
      awaitingVerification: issues.filter((i) => i.status === Status.CLAIMED_FIXED).length,
      reopenedIssues: issues.filter((i) => i.status === Status.REOPENED_IN_WARRANTY).length,
      disputedIssues: issues.filter((i) => i.status === Status.DISPUTED).length,
      totalInPeriod,
    },
    hotspots: hotspots.slice(0, 8),
    issuesGeo: activeIssues
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .slice(0, 120)
      .map((i) => ({
        id: i.id,
        category: i.category,
        status: i.status,
        band: i.bandOverride ?? i.band,
        lat: i.lat,
        lng: i.lng,
        address: i.address,
      })),
    dispatchSuggestions,
    refreshedAt: now.toISOString(),
  };
}
