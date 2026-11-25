import { prisma } from "@/lib/db/prisma";
import { Category, Status, Band, Role } from "@prisma/client";

export type TimePeriod = "7d" | "30d" | "90d" | "6m" | "all";

export interface WardOverviewMetrics {
  totalIssues: number;
  activeIssues: number;
  verifiedResolvedIssues: number;
  awaitingVerificationIssues: number;
  criticalHighIssues: number;
  slaBreachedIssues: number;
}

export interface CategoryMetric {
  category: Category;
  label: string;
  count: number;
  percentage: number;
  activeCount: number;
  resolvedCount: number;
  priorityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  color: string;
}

export interface HotspotCluster {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  issueCount: number;
  weight: number;
  name: string;
  topCategories: string[];
  priorityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recurringCount: number;
  representativeIssues: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    priority: string;
    address: string | null;
    createdAt: string;
  }>;
}

export interface ResolutionPerformanceMetrics {
  totalReports: number;
  resolvedReports: number;
  resolutionRate: number;
  avgResolutionTimeHours: number | null;
  avgResolutionTimeDays: number | null;
  outstandingIssues: number;
  slaBreachRate: number;
  independentVerificationRate: number;
  reopenedRepairsCount: number;
  claimedFixedCount: number;
  disputedCount: number;
}

export interface FlaggedRecurringHotspot {
  id: string;
  location: string;
  lat: number;
  lng: number;
  recurrenceType: "REPEATED_DEFECT" | "POST_REPAIR_FAILURE" | "MULTI_CATEGORY_CONVERGENCE" | "WARRANTY_BREACH";
  typeLabel: string;
  issueCount: number;
  evidenceSummary: string;
  category: string;
  deteriorationRisk: string;
  deteriorationScore: number;
  firstReportedAt: string;
  lastReportedAt: string;
  issues: Array<{ id: string; title: string; status: string; createdAt: string }>;
}

export interface TrendTimeBucket {
  label: string;
  startDate: string;
  newReports: number;
  verifiedRepairs: number;
  backlog: number;
  slaBreaches: number;
}

export interface WardBriefingOutput {
  headline: string;
  measuredFacts: string[];
  recommendedActions: Array<{
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    reason: string;
    affectedCategory: string;
  }>;
  isAiGenerated: boolean;
  engine: string;
}

export interface AgencyPerformanceItem {
  agencyId: string;
  agencyCode: string;
  agencyName: string;
  assignedCount: number;
  inProgressCount: number;
  verifiedResolutionsCount: number;
  avgResolutionHours: number | null;
  slaComplianceRate: number;
  disputedCount: number;
  sampleSize: number;
}

export interface WardComparisonItem {
  wardId: string;
  wardCode: string;
  wardName: string;
  totalIssues: number;
  activeIssues: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  slaBreachRate: number;
  criticalCount: number;
  hotspotCount: number;
  topCategory: string;
  isCurrentWard: boolean;
}

export interface WardIntelligenceData {
  ward: {
    id: string;
    code: string;
    name: string;
    fullName: string;
    wardLabel: string;
    lat: number;
    lng: number;
    bbox: [[number, number], [number, number]] | null;
    hasGeometry: boolean;
    boundaryGeoJson: unknown;
    locality: string;
  };
  period: TimePeriod;
  lastRefreshedAt: string;
  latestIssueDate: string | null;
  overview: WardOverviewMetrics;
  categoryAnalysis: CategoryMetric[];
  geoIntelligence: {
    hotspots: HotspotCluster[];
    issuesGeo: Array<{
      id: string;
      category: string;
      status: string;
      band: string;
      priority: number;
      lat: number;
      lng: number;
      address: string | null;
      title: string;
      isHotspot: boolean;
      recurrenceOf: string | null;
      slaBreached: boolean;
      createdAt: string;
    }>;
  };
  resolutionPerformance: ResolutionPerformanceMetrics;
  recurringAnalysis: {
    totalRecurringIssues: number;
    flaggedHotspots: FlaggedRecurringHotspot[];
  };
  historicalTrends: {
    interval: "daily" | "weekly" | "monthly";
    timeBuckets: TrendTimeBucket[];
  };
  wardBriefing: WardBriefingOutput;
  authorityOnly?: {
    agencyPerformance: AgencyPerformanceItem[];
    wardComparison: WardComparisonItem[];
  };
}

const CATEGORY_COLORS: Record<Category, string> = {
  POTHOLES: "#527B7A",
  DRAINAGE: "#718F9E",
  WATERLOGGING: "#4A7C92",
  STREETLIGHTS: "#B68B63",
  SIDEWALKS: "#87917B",
  FOOTPATH: "#9AA88E",
  TRAFFIC_SIGNS: "#B76F60",
  ROAD_CUT: "#7A6B88",
  TREE_FALL: "#5F8265",
  GRAFFITI: "#886B85",
  TRASH: "#537C60",
  OTHER: "#66766D",
};

const CATEGORY_LABELS: Record<Category, string> = {
  POTHOLES: "Potholes",
  DRAINAGE: "Drainage",
  WATERLOGGING: "Waterlogging",
  STREETLIGHTS: "Streetlights",
  SIDEWALKS: "Sidewalks",
  FOOTPATH: "Footpaths",
  TRAFFIC_SIGNS: "Traffic Signs",
  ROAD_CUT: "Road Cuts",
  TREE_FALL: "Tree Fall",
  GRAFFITI: "Graffiti",
  TRASH: "Trash",
  OTHER: "Other",
};

const ALL_PRISMA_CATEGORIES: Category[] = [
  Category.POTHOLES,
  Category.DRAINAGE,
  Category.WATERLOGGING,
  Category.STREETLIGHTS,
  Category.SIDEWALKS,
  Category.FOOTPATH,
  Category.TRAFFIC_SIGNS,
  Category.ROAD_CUT,
  Category.TREE_FALL,
  Category.GRAFFITI,
  Category.TRASH,
  Category.OTHER,
];

const CLOSED_STATUSES = new Set<Status>([Status.VERIFIED_FIXED, Status.REJECTED]);

const ACTIVE_UNRESOLVED_STATUSES = new Set<Status>([
  Status.OPEN,
  Status.CONFIRMED,
  Status.ASSIGNED,
  Status.IN_PROGRESS,
  Status.REOPENED_IN_WARRANTY,
  Status.DISPUTED,
]);

export function isUnresolvedIssueStatus(status: Status): boolean {
  return !CLOSED_STATUSES.has(status);
}

export function isCriticalOrHighUnresolved(issue: {
  band?: Band | null;
  bandOverride?: Band | null;
  status: Status;
}): boolean {
  if (!isUnresolvedIssueStatus(issue.status)) return false;
  const effectiveBand = issue.bandOverride ?? issue.band;
  return effectiveBand === Band.CRITICAL || effectiveBand === Band.HIGH;
}

export function isSlaBreachedUnresolved(
  issue: {
    status: Status;
    slaBreached: boolean;
    slaDueAt: Date;
  },
  now: Date = new Date()
): boolean {
  if (!isUnresolvedIssueStatus(issue.status)) return false;
  return Boolean(issue.slaBreached || issue.slaDueAt < now);
}

export function computeWardOverviewMetrics<
  T extends {
    id: string;
    status: Status;
    band?: Band | null;
    bandOverride?: Band | null;
    slaBreached: boolean;
    slaDueAt: Date;
  }
>(rawIssues: T[], now: Date = new Date()): WardOverviewMetrics {
  const distinctMap = new Map<string, T>();
  for (const item of rawIssues) {
    if (!distinctMap.has(item.id)) {
      distinctMap.set(item.id, item);
    }
  }
  const issues = Array.from(distinctMap.values());

  return {
    totalIssues: issues.length,
    activeIssues: issues.filter((i) => ACTIVE_UNRESOLVED_STATUSES.has(i.status)).length,
    verifiedResolvedIssues: issues.filter((i) => i.status === Status.VERIFIED_FIXED).length,
    awaitingVerificationIssues: issues.filter((i) => i.status === Status.CLAIMED_FIXED).length,
    criticalHighIssues: issues.filter((i) => isCriticalOrHighUnresolved(i)).length,
    slaBreachedIssues: issues.filter((i) => isSlaBreachedUnresolved(i, now)).length,
  };
}

/**
 * Calculates start Date based on period selection
 */
function getPeriodStartDate(period: TimePeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    case "6m":
      return new Date(now.getTime() - 180 * 24 * 3600 * 1000);
    case "all":
    default:
      return null;
  }
}

/**
 * Main analytics aggregator for Ward Intelligence
 */
export async function getWardIntelligence(
  wardIdentifier: string,
  period: TimePeriod = "30d",
  userRole: Role = Role.CITIZEN
): Promise<WardIntelligenceData | null> {
  // 1. Resolve Target Ward from DB (prefer exact id/code/officialId)
  const cleanId = wardIdentifier.trim();
  const lower = cleanId.toLowerCase();
  const numOnly = lower.replace(/^ward-?/i, "");

  let targetWard = await prisma.ward.findFirst({
    where: {
      OR: [
        { id: { equals: cleanId, mode: "insensitive" } },
        { code: { equals: cleanId, mode: "insensitive" } },
        { officialId: { equals: cleanId, mode: "insensitive" } },
      ],
    },
    include: { corporation: true },
  });

  if (!targetWard) {
    targetWard = await prisma.ward.findFirst({
      where: {
        OR: [
          { code: { equals: `WARD-${cleanId}`, mode: "insensitive" } },
          { code: { equals: `WARD-${numOnly}`, mode: "insensitive" } },
        ],
      },
      include: { corporation: true },
    });
  }

  if (!targetWard) {
    return null;
  }

  // Query geometry details (Centroid, BBox, GeoJSON) via PostGIS
  const wardGeomRes = await prisma.$queryRaw<Array<{
    lat: number | null;
    lng: number | null;
    min_lat: number | null;
    min_lng: number | null;
    max_lat: number | null;
    max_lng: number | null;
    geom_json: string | null;
    has_geom: boolean;
  }>>`
    SELECT ST_Y(ST_Centroid(geom::geometry)) as lat,
           ST_X(ST_Centroid(geom::geometry)) as lng,
           ST_YMin(ST_Envelope(geom::geometry)) as min_lat,
           ST_XMin(ST_Envelope(geom::geometry)) as min_lng,
           ST_YMax(ST_Envelope(geom::geometry)) as max_lat,
           ST_XMax(ST_Envelope(geom::geometry)) as max_lng,
           ST_AsGeoJSON(geom::geometry) as geom_json,
           (geom IS NOT NULL) as has_geom
    FROM "Ward"
    WHERE id = ${targetWard.id}
    LIMIT 1;
  `;

  const geomData = wardGeomRes[0] || null;
  let boundaryGeoJson = null;
  try {
    if (geomData?.geom_json) {
      boundaryGeoJson = JSON.parse(geomData.geom_json);
    }
  } catch {
    // ignore
  }

  const hasGeometry = Boolean(geomData?.has_geom && boundaryGeoJson);
  const bbox: [[number, number], [number, number]] | null =
    hasGeometry &&
    geomData?.min_lat != null &&
    geomData?.min_lng != null &&
    geomData?.max_lat != null &&
    geomData?.max_lng != null
      ? [[geomData.min_lat, geomData.min_lng], [geomData.max_lat, geomData.max_lng]]
      : null;

  const isPilot = Boolean(targetWard.isOperationalArea || targetWard.code.toUpperCase().includes("PILOT"));
  const codeNumber = targetWard.wardNumber != null
    ? String(targetWard.wardNumber)
    : targetWard.code.replace(/^[A-Z]+-/, "");
  const cleanName = targetWard.name.replace(/\s*\(Demo\)/i, "").trim();

  // 2. Query Issues for this Ward with Time Period Filter
  const startDate = getPeriodStartDate(period);
  const issues = await prisma.issue.findMany({
    where: {
      wardId: targetWard.id,
      ...(startDate && { createdAt: { gte: startDate } }),
    },
    include: {
      agency: { select: { id: true, code: true, name: true } },
      reports: {
        select: { id: true, createdAt: true, note: true },
        orderBy: { createdAt: "asc" },
      },
      actions: {
        select: {
          id: true,
          action: true,
          toStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { reports: true, verifications: true, comments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalDistinctIssues = issues.length;

  // Latest issue date in ward
  const latestIssueDate = issues.length > 0 ? issues[0].createdAt.toISOString() : null;

  // 3. Section A — Core Metrics Computation
  const now = new Date();
  const overview = computeWardOverviewMetrics(issues, now);
  const verifiedResolved = issues.filter((i) => i.status === Status.VERIFIED_FIXED);
  const awaitingVerification = issues.filter((i) => i.status === Status.CLAIMED_FIXED);
  const activeIssues = issues.filter((i) => ACTIVE_UNRESOLVED_STATUSES.has(i.status));
  const criticalHighIssues = issues.filter((i) => isCriticalOrHighUnresolved(i));
  const slaBreachedIssues = issues.filter((i) => isSlaBreachedUnresolved(i, now));

  // 4. Section B — Category Analysis Computation (all 12 Prisma categories)
  const categoryAnalysis: CategoryMetric[] = ALL_PRISMA_CATEGORIES.map((cat) => {
    const matching = issues.filter((i) => i.category === cat);
    const count = matching.length;
    const percentage = totalDistinctIssues > 0 ? Number(((count / totalDistinctIssues) * 100).toFixed(1)) : 0;
    const resolvedCount = matching.filter((i) => i.status === Status.VERIFIED_FIXED).length;
    const actCount = count - resolvedCount;

    const critical = matching.filter((i) => i.band === Band.CRITICAL).length;
    const high = matching.filter((i) => i.band === Band.HIGH).length;
    const medium = matching.filter((i) => i.band === Band.MEDIUM).length;
    const low = matching.filter((i) => i.band === Band.LOW).length;

    return {
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      count,
      percentage,
      activeCount: actCount,
      resolvedCount,
      priorityBreakdown: { critical, high, medium, low },
      color: CATEGORY_COLORS[cat] || "#527B7A",
    };
  }).sort((a, b) => b.count - a.count);

  // 5. Section C — Geographical Intelligence and Hotspot Clustering
  // Spatial cluster radius: ~180 meters (approx 0.0016 degrees lat/lng)
  const CLUSTER_THRESHOLD_DEG = 0.0018;
  const visited = new Set<string>();
  const rawClusters: Array<{
    centerLat: number;
    centerLng: number;
    items: typeof issues;
  }> = [];

  for (let i = 0; i < issues.length; i++) {
    const a = issues[i];
    if (visited.has(a.id)) continue;

    const clusterItems = [a];
    visited.add(a.id);

    for (let j = i + 1; j < issues.length; j++) {
      const b = issues[j];
      if (visited.has(b.id)) continue;
      const dLat = Math.abs(a.lat - b.lat);
      const dLng = Math.abs(a.lng - b.lng);
      if (dLat <= CLUSTER_THRESHOLD_DEG && dLng <= CLUSTER_THRESHOLD_DEG) {
        clusterItems.push(b);
        visited.add(b.id);
      }
    }

    const avgLat = clusterItems.reduce((acc, it) => acc + it.lat, 0) / clusterItems.length;
    const avgLng = clusterItems.reduce((acc, it) => acc + it.lng, 0) / clusterItems.length;

    rawClusters.push({
      centerLat: avgLat,
      centerLng: avgLng,
      items: clusterItems,
    });
  }

  // Format Hotspot Clusters
  const maxIssuesInCluster = Math.max(1, ...rawClusters.map((c) => c.items.length));
  const hotspots: HotspotCluster[] = rawClusters.map((cl, idx) => {
    const count = cl.items.length;
    const weight = Number((count / maxIssuesInCluster).toFixed(2));
    const representative = cl.items[0];
    const locationName = representative.address || `Hotspot Cluster ${idx + 1} (${cl.centerLat.toFixed(4)}, ${cl.centerLng.toFixed(4)})`;

    // Category distribution inside hotspot
    const catCounts: Record<string, number> = {};
    cl.items.forEach((it) => {
      catCounts[it.category] = (catCounts[it.category] || 0) + 1;
    });
    const topCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => CATEGORY_LABELS[cat as Category] || cat)
      .slice(0, 3);

    const recurring = cl.items.filter(
      (it) => it.isHotspot || Boolean(it.recurrenceOf) || it.handoffCount > 0
    ).length;

    const critical = cl.items.filter((i) => i.band === Band.CRITICAL).length;
    const high = cl.items.filter((i) => i.band === Band.HIGH).length;
    const medium = cl.items.filter((i) => i.band === Band.MEDIUM).length;
    const low = cl.items.filter((i) => i.band === Band.LOW).length;

    return {
      id: `hotspot-${idx + 1}-${representative.id}`,
      lat: cl.centerLat,
      lng: cl.centerLng,
      radiusMeters: Math.min(350, Math.max(100, count * 50)),
      issueCount: count,
      weight,
      name: locationName,
      topCategories,
      priorityBreakdown: { critical, high, medium, low },
      recurringCount: recurring,
      representativeIssues: cl.items.slice(0, 5).map((it) => ({
        id: it.id,
        title: `${CATEGORY_LABELS[it.category] || it.category} at ${it.address || "Ward location"}`,
        category: it.category,
        status: it.status,
        priority: it.band,
        address: it.address,
        createdAt: it.createdAt.toISOString(),
      })),
    };
  }).sort((a, b) => b.issueCount - a.issueCount);

  // Clean Geo issue markers list
  const issuesGeo = issues.map((i) => ({
    id: i.id,
    category: i.category,
    status: i.status,
    band: i.band,
    priority: i.priority,
    lat: i.lat,
    lng: i.lng,
    address: i.address,
    title: `${CATEGORY_LABELS[i.category] || i.category} at ${i.address || "Ward location"}`,
    isHotspot: Boolean(i.isHotspot),
    recurrenceOf: i.recurrenceOf,
    slaBreached: i.slaBreached,
    createdAt: i.createdAt.toISOString(),
  }));

  // 6. Section D — Resolution Performance
  let totalResolutionTimeHours = 0;
  let resolvedWithTimestampCount = 0;

  for (const item of issues) {
    if (item.status === Status.VERIFIED_FIXED || item.status === Status.CLAIMED_FIXED) {
      // Find timestamp from ActionLog when moved to fixed
      const action = item.actions.find(
        (a) => a.toStatus === Status.VERIFIED_FIXED || a.toStatus === Status.CLAIMED_FIXED
      );
      const resDate = action?.createdAt || item.repairClaimedAt || item.updatedAt;
      if (resDate && resDate > item.createdAt) {
        const hours = (resDate.getTime() - item.createdAt.getTime()) / (1000 * 3600);
        totalResolutionTimeHours += hours;
        resolvedWithTimestampCount++;
      }
    }
  }

  const avgResolutionTimeHours =
    resolvedWithTimestampCount > 0
      ? Number((totalResolutionTimeHours / resolvedWithTimestampCount).toFixed(1))
      : null;
  const avgResolutionTimeDays =
    avgResolutionTimeHours !== null
      ? Number((avgResolutionTimeHours / 24).toFixed(1))
      : null;

  const resolutionRate =
    totalDistinctIssues > 0
      ? Number(((verifiedResolved.length / totalDistinctIssues) * 100).toFixed(1))
      : 0;

  const slaBreachRate =
    totalDistinctIssues > 0
      ? Number(((slaBreachedIssues.length / totalDistinctIssues) * 100).toFixed(1))
      : 0;

  const claimsTotal = verifiedResolved.length + awaitingVerification.length;
  const independentVerificationRate =
    claimsTotal > 0
      ? Number(((verifiedResolved.length / claimsTotal) * 100).toFixed(1))
      : 0;

  const reopenedRepairsCount = issues.filter(
    (i) => i.handoffCount > 0 || i.status === Status.REOPENED_IN_WARRANTY
  ).length;

  const resolutionPerformance: ResolutionPerformanceMetrics = {
    totalReports: totalDistinctIssues,
    resolvedReports: verifiedResolved.length,
    resolutionRate,
    avgResolutionTimeHours,
    avgResolutionTimeDays,
    outstandingIssues: activeIssues.length,
    slaBreachRate,
    independentVerificationRate,
    reopenedRepairsCount,
    claimedFixedCount: awaitingVerification.length,
    disputedCount: issues.filter((i) => i.status === Status.DISPUTED).length,
  };

  // 7. Section E — Recurring Infrastructure Problems & Hotspots
  const flaggedHotspots: FlaggedRecurringHotspot[] = [];

  // Group recurring issues by proximity or recurrenceOf
  for (const cl of hotspots) {
    const hasWarrantyIssue = issues.some(
      (i) =>
        cl.representativeIssues.some((r) => r.id === i.id) &&
        (Boolean(i.warrantyUntil) || Boolean(i.recurrenceOf) || i.handoffCount > 0 || i.isHotspot)
    );

    if (cl.issueCount >= 2 || hasWarrantyIssue) {
      let recurrenceType: FlaggedRecurringHotspot["recurrenceType"] = "REPEATED_DEFECT";
      let typeLabel = "Repeated Defect Cluster";
      let evidence = `${cl.issueCount} civic issues registered within a 180m zone. Top category: ${cl.topCategories.join(", ")}.`;

      if (hasWarrantyIssue) {
        recurrenceType = "WARRANTY_BREACH";
        typeLabel = "Post-Repair Recurrence";
        evidence = `Recurring surface/infrastructure failures logged following contractor repair within warranty period.`;
      } else if (cl.topCategories.length >= 2) {
        recurrenceType = "MULTI_CATEGORY_CONVERGENCE";
        typeLabel = "Multi-Defect Corridor";
        evidence = `Multiple infrastructure categories failing simultaneously: ${cl.topCategories.join(", ")}.`;
      }

      flaggedHotspots.push({
        id: `recurring-${cl.id}`,
        location: cl.name,
        lat: cl.lat,
        lng: cl.lng,
        recurrenceType,
        typeLabel,
        issueCount: cl.issueCount,
        evidenceSummary: evidence,
        category: cl.topCategories[0] || "Other",
        deteriorationRisk: cl.priorityBreakdown.critical > 0 ? "HIGH" : "MED",
        deteriorationScore: Math.min(95, 40 + cl.issueCount * 12),
        firstReportedAt: cl.representativeIssues[cl.representativeIssues.length - 1]?.createdAt || new Date().toISOString(),
        lastReportedAt: cl.representativeIssues[0]?.createdAt || new Date().toISOString(),
        issues: cl.representativeIssues.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          createdAt: r.createdAt,
        })),
      });
    }
  }

  const recurringAnalysis = {
    totalRecurringIssues: flaggedHotspots.reduce((acc, h) => acc + h.issueCount, 0),
    flaggedHotspots: flaggedHotspots.slice(0, 8),
  };

  // 8. Section F — Historical Trends (Time-series aggregation)
  const timeBuckets: TrendTimeBucket[] = [];
  const daysSpan = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : period === "6m" ? 180 : 365;
  const numBuckets = period === "7d" ? 7 : 6;
  const bucketDurationMs = (daysSpan * 24 * 3600 * 1000) / numBuckets;
  const intervalType = period === "7d" ? "daily" : period === "30d" ? "weekly" : "monthly";

  const trendStartMs = (startDate || new Date(Date.now() - daysSpan * 24 * 3600 * 1000)).getTime();

  for (let b = 0; b < numBuckets; b++) {
    const bStart = new Date(trendStartMs + b * bucketDurationMs);
    const bEnd = new Date(trendStartMs + (b + 1) * bucketDurationMs);

    const newInBucket = issues.filter(
      (i) => i.createdAt >= bStart && i.createdAt < bEnd
    );

    const resolvedInBucket = issues.filter((i) => {
      const act = i.actions.find(
        (a) => a.toStatus === Status.VERIFIED_FIXED || a.toStatus === Status.CLAIMED_FIXED
      );
      const resDate = act?.createdAt || i.repairClaimedAt || i.updatedAt;
      return i.status === Status.VERIFIED_FIXED && resDate >= bStart && resDate < bEnd;
    });

    const breachesInBucket = newInBucket.filter((i) => i.slaBreached).length;

    // Cumulative backlog at this point
    const backlogAtBucket = issues.filter(
      (i) => i.createdAt <= bEnd && (i.status !== Status.VERIFIED_FIXED || i.updatedAt > bEnd)
    ).length;

    const label =
      period === "7d"
        ? bStart.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })
        : period === "30d"
        ? `Wk ${b + 1}`
        : bStart.toLocaleDateString("en-IN", { month: "short", day: "numeric" });

    timeBuckets.push({
      label,
      startDate: bStart.toISOString(),
      newReports: newInBucket.length,
      verifiedRepairs: resolvedInBucket.length,
      backlog: backlogAtBucket,
      slaBreaches: breachesInBucket,
    });
  }

  // 9. Section H — AI Ward Briefing (Data-grounded facts + actionable recommendations)
  const topCat = categoryAnalysis[0];
  const secondCat = categoryAnalysis[1];
  const measuredFacts: string[] = [];

  if (topCat && topCat.count > 0) {
    measuredFacts.push(
      `${topCat.label} represents the largest volume of infrastructure defects in ${cleanName}, accounting for ${topCat.percentage}% (${topCat.count} of ${totalDistinctIssues}) of registered issues.`
    );
  }

  if (secondCat && secondCat.count > 0) {
    measuredFacts.push(
      `${secondCat.label} issues follow closely with ${secondCat.count} recorded complaints (${secondCat.percentage}%).`
    );
  }

  if (slaBreachedIssues.length > 0) {
    measuredFacts.push(
      `${slaBreachedIssues.length} unresolved ${slaBreachedIssues.length === 1 ? "issue has" : "issues have"} exceeded the municipal Service Level Agreement deadline, representing a ${slaBreachRate}% breach rate.`
    );
  } else {
    measuredFacts.push(`Zero active issues are currently in SLA breach condition across ${cleanName}.`);
  }

  if (awaitingVerification.length > 0) {
    measuredFacts.push(
      `${awaitingVerification.length} repair ${awaitingVerification.length === 1 ? "claim is" : "claims are"} currently logged by field contractors awaiting independent citizen verification.`
    );
  }

  if (flaggedHotspots.length > 0) {
    measuredFacts.push(
      `Identified ${flaggedHotspots.length} recurring hotspot locations along key corridors with repeated infrastructure failures.`
    );
  }

  const recommendedActions: WardBriefingOutput["recommendedActions"] = [];

  if (criticalHighIssues.length > 0) {
    const critCat = criticalHighIssues[0].category;
    recommendedActions.push({
      priority: "CRITICAL",
      title: `Prioritize ${criticalHighIssues.length} high-severity hazards`,
      reason: `Unattended critical defects present elevated road safety and traffic disruption risks.`,
      affectedCategory: CATEGORY_LABELS[critCat] || critCat,
    });
  }

  if (slaBreachedIssues.length > 0) {
    recommendedActions.push({
      priority: "HIGH",
      title: "Expedite overdue SLA work orders",
      reason: `${slaBreachedIssues.length} tickets have breached statutory response windows and require operational escalation.`,
      affectedCategory: "Operations",
    });
  }

  if (awaitingVerification.length > 0) {
    recommendedActions.push({
      priority: "HIGH",
      title: "Mobilize citizen repair verification",
      reason: `${awaitingVerification.length} completed repair claims require on-site photographic evidence to close the claim gap.`,
      affectedCategory: "Audit",
    });
  }

  if (flaggedHotspots.length > 0) {
    const topHotspot = flaggedHotspots[0];
    recommendedActions.push({
      priority: "MEDIUM",
      title: `Conduct engineering review at ${topHotspot.location}`,
      reason: topHotspot.evidenceSummary,
      affectedCategory: topHotspot.category,
    });
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push({
      priority: "MEDIUM",
      title: "Maintain preventative infrastructure monitoring",
      reason: "No acute SLA breaches or unverified claims detected in the selected time period.",
      affectedCategory: "General",
    });
  }

  const headline =
    topCat && topCat.count > 0
      ? `${topCat.label} & Road Defect Telemetry for ${cleanName}`
      : `Infrastructure Telemetry & Condition Report — ${cleanName}`;

  const wardBriefing: WardBriefingOutput = {
    headline,
    measuredFacts,
    recommendedActions,
    isAiGenerated: false,
    engine: "CIVIC_ATLAS_ANALYTICS_V2",
  };

  // 10. Authority-Only Sections (Agency Performance & Ward Comparison)
  let authorityOnlyData = undefined;

  if (userRole === Role.AUTHORITY) {
    // Section G: Agency Performance Breakdown
    const agencies = await prisma.agency.findMany({
      select: { id: true, code: true, name: true, slaHours: true },
    });

    const agencyPerformance: AgencyPerformanceItem[] = agencies
      .map((ag) => {
        const agIssues = issues.filter((i) => i.agencyId === ag.id);
        const assigned = agIssues.filter(
          (i) => i.status === Status.ASSIGNED || i.status === Status.CONFIRMED
        ).length;
        const inProg = agIssues.filter((i) => i.status === Status.IN_PROGRESS).length;
        const verified = agIssues.filter((i) => i.status === Status.VERIFIED_FIXED).length;
        const disputed = agIssues.filter((i) => i.status === Status.DISPUTED).length;

        // SLA compliance for this agency
        const breaches = agIssues.filter((i) => i.slaBreached).length;
        const complianceRate =
          agIssues.length > 0
            ? Number((((agIssues.length - breaches) / agIssues.length) * 100).toFixed(1))
            : 100;

        let totalHours = 0;
        let counted = 0;
        agIssues.forEach((i) => {
          if (i.status === Status.VERIFIED_FIXED || i.status === Status.CLAIMED_FIXED) {
            const act = i.actions.find((a) => a.toStatus === Status.VERIFIED_FIXED);
            const resDate = act?.createdAt || i.repairClaimedAt || i.updatedAt;
            if (resDate && resDate > i.createdAt) {
              totalHours += (resDate.getTime() - i.createdAt.getTime()) / (1000 * 3600);
              counted++;
            }
          }
        });

        const avgResolutionHours = counted > 0 ? Number((totalHours / counted).toFixed(1)) : null;

        return {
          agencyId: ag.id,
          agencyCode: ag.code,
          agencyName: ag.name,
          assignedCount: assigned,
          inProgressCount: inProg,
          verifiedResolutionsCount: verified,
          avgResolutionHours,
          slaComplianceRate: complianceRate,
          disputedCount: disputed,
          sampleSize: agIssues.length,
        };
      })
      .filter((ag) => ag.sampleSize > 0)
      .sort((a, b) => b.sampleSize - a.sampleSize);

    // Section I: Ward Comparison Breakdown
    const allWards = await prisma.ward.findMany({
      where: { isLegacy: false, isOperationalArea: false },
      select: { id: true, code: true, name: true },
      orderBy: [{ wardNumber: "asc" }, { code: "asc" }],
    });

    const allWardsIssues = await prisma.issue.findMany({
      where: {
        ...(startDate && { createdAt: { gte: startDate } }),
      },
      select: {
        id: true,
        wardId: true,
        category: true,
        status: true,
        band: true,
        bandOverride: true,
        slaBreached: true,
        slaDueAt: true,
        createdAt: true,
        repairClaimedAt: true,
        updatedAt: true,
        isHotspot: true,
      },
    });

    const wardComparison: WardComparisonItem[] = allWards.map((w) => {
      const wIssues = allWardsIssues.filter((i) => i.wardId === w.id);
      const total = wIssues.length;
      const verified = wIssues.filter((i) => i.status === Status.VERIFIED_FIXED).length;
      const active = total - verified;
      const resRate = total > 0 ? Number(((verified / total) * 100).toFixed(1)) : 0;
      const breaches = wIssues.filter((i) => isSlaBreachedUnresolved(i, now)).length;
      const breachRate = total > 0 ? Number(((breaches / total) * 100).toFixed(1)) : 0;
      const criticalCount = wIssues.filter((i) => isCriticalOrHighUnresolved(i)).length;
      const hotspotCount = wIssues.filter((i) => i.isHotspot).length;

      // Top category in that ward
      const catCounts: Record<string, number> = {};
      wIssues.forEach((i) => {
        catCounts[i.category] = (catCounts[i.category] || 0) + 1;
      });
      const topEntry = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
      const topCategory = topEntry ? CATEGORY_LABELS[topEntry[0] as Category] || topEntry[0] : "None";

      return {
        wardId: w.id,
        wardCode: w.code,
        wardName: w.name.replace(/\s*\(Demo\)/i, "").trim(),
        totalIssues: total,
        activeIssues: active,
        resolutionRate: resRate,
        avgResolutionHours: null,
        slaBreachRate: breachRate,
        criticalCount,
        hotspotCount,
        topCategory,
        isCurrentWard: w.id === targetWard.id,
      };
    });

    authorityOnlyData = {
      agencyPerformance,
      wardComparison,
    };
  }

  return {
    ward: {
      id: targetWard.id,
      code: targetWard.code,
      name: cleanName,
      fullName: isPilot ? cleanName : `Ward ${codeNumber} • ${cleanName}`,
      wardLabel: isPilot ? "ORR Corridor" : `Ward ${codeNumber}`,
      lat: geomData?.lat ?? (isPilot ? 12.95 : 12.9716),
      lng: geomData?.lng ?? (isPilot ? 77.65 : 77.5946),
      bbox,
      hasGeometry,
      boundaryGeoJson,
      locality: cleanName,
    },
    period,
    lastRefreshedAt: new Date().toISOString(),
    latestIssueDate,
    overview,
    categoryAnalysis,
    geoIntelligence: {
      hotspots,
      issuesGeo,
    },
    resolutionPerformance,
    recurringAnalysis,
    historicalTrends: {
      interval: intervalType,
      timeBuckets,
    },
    wardBriefing,
    authorityOnly: authorityOnlyData,
  };
}
