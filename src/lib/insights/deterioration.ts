import "server-only";
import { prisma } from "@/lib/db/prisma";
import { DeteriorationRisk, Category, Status } from "@prisma/client";
import { recomputeAndSaveBestRepairWindow } from "@/lib/traffic/repairWindow";

export interface DeteriorationDriver {
  name: string;
  factor: "weather" | "heavy_traffic" | "traffic_delay" | "defect_type" | "defect_size" | "repeat_failure";
  impactScore: number;
  description: string;
}

export interface DeteriorationResult {
  risk: DeteriorationRisk;
  score: number; // 0-100
  expectedDaysToWorsen: number | null;
  drivers: DeteriorationDriver[];
  explanation: string;
}

export interface ComputeDeteriorationOptions {
  category: Category;
  sizeClass?: string | null;
  roadClass?: string | null;
  busesPerHour?: number;
  delayRatio?: number;
  past7DaysRainMm?: number;
  forecast72hRainMm?: number;
  recurrenceCount12m?: number;
}

/**
 * Pure calculation function: computes deterioration risk, score, expected worsen days,
 * and named drivers based on road engineering criteria.
 */
export function computeDeterioration(options: ComputeDeteriorationOptions): DeteriorationResult {
  const {
    category,
    sizeClass = "MEDIUM",
    busesPerHour = 0,
    delayRatio = 0.10,
    past7DaysRainMm = 0,
    forecast72hRainMm = 0,
    recurrenceCount12m = 0,
  } = options;

  // Rule: Non-decay categories (TRASH, DEBRIS, GRAFFITI) do not deteriorate
  const catStr = String(category).toUpperCase();
  if (catStr === "TRASH" || catStr === "DEBRIS" || catStr === "GRAFFITI") {
    return {
      risk: DeteriorationRisk.LOW,
      score: 5,
      expectedDaysToWorsen: null,
      drivers: [
        {
          name: "Non-deteriorating category",
          factor: "defect_type",
          impactScore: 0,
          description: "Surface debris or trash defects do not deteriorate pavement sub-base structure.",
        },
      ],
      explanation: "Debris does not deteriorate over time.",
    };
  }

  const drivers: DeteriorationDriver[] = [];
  let score = 20; // baseline

  // 1. Defect Category Factor
  if (
    catStr === "POTHOLES" ||
    catStr === "POTHOLE" ||
    catStr === "WATERLOGGING" ||
    catStr === "ROAD_CUT"
  ) {
    score += 25;
    drivers.push({
      name: "High-decay defect type",
      factor: "defect_type",
      impactScore: 25,
      description: `${catStr} defects experience rapid sub-base erosion.`,
    });
  } else if (catStr === "STREETLIGHTS" || catStr === "STREETLIGHT") {
    // Electrical defect: does not physically erode sub-base
    score = Math.max(10, score - 10);
  }

  // 2. Defect Size Class Factor
  const normSize = (sizeClass || "MEDIUM").toUpperCase();
  if (normSize === "LARGE") {
    score += 20;
    drivers.push({
      name: "Large defect geometry",
      factor: "defect_size",
      impactScore: 20,
      description: "Large surface ruptures accelerate wheel impact damage exponentially.",
    });
  } else if (normSize === "MEDIUM") {
    score += 10;
  } else if (normSize === "SMALL") {
    score -= 10;
  }

  // 3. Weather / Moisture Factor (past 7 days rainfall + next 72 hours forecast)
  const totalRainMm = past7DaysRainMm + forecast72hRainMm;
  if (totalRainMm >= 20) {
    const rainPoints = Math.min(30, Math.round(15 + (totalRainMm - 20) * 0.5));
    score += rainPoints;
    drivers.push({
      name: `Heavy rain: ${Math.round(past7DaysRainMm)} mm past 7 d (${Math.round(totalRainMm)} mm total)`,
      factor: "weather",
      impactScore: rainPoints,
      description: `Water saturates the granular base; ${Math.round(past7DaysRainMm)} mm past rain weakens structural integrity.`,
    });
  } else if (totalRainMm >= 5) {
    score += 10;
    drivers.push({
      name: `Moderate moisture: ${Math.round(totalRainMm)} mm rain`,
      factor: "weather",
      impactScore: 10,
      description: "Moderate moisture present in roadbed.",
    });
  }

  // 4. Heavy Vehicles / Bus Frequency Factor
  if (busesPerHour >= 20) {
    const busPoints = busesPerHour >= 40 ? 25 : 15;
    score += busPoints;
    drivers.push({
      name: `High bus frequency: ${Math.round(busesPerHour)} buses/h`,
      factor: "heavy_traffic",
      impactScore: busPoints,
      description: "Repetitive heavy axle loadings cause dynamic fatigue on defective asphalt.",
    });
  }

  // 5. Traffic Congestion & Stop-and-Go Braking
  if (delayRatio >= 0.40) {
    const delayPoints = delayRatio >= 0.60 ? 15 : 10;
    score += delayPoints;
    drivers.push({
      name: `Stop-and-go braking: delay ${Math.round(delayRatio * 100)}%`,
      factor: "traffic_delay",
      impactScore: delayPoints,
      description: "Heavy shear stresses from repeated braking accelerate raveling and rutting.",
    });
  }

  // 6. Repeat Failure / Weak Sub-base History
  if (recurrenceCount12m >= 2) {
    score += 20;
    drivers.push({
      name: `Repeat failure: ${recurrenceCount12m} issues in 12 months`,
      factor: "repeat_failure",
      impactScore: 20,
      description: "Chronic recurrence indicates compromised subgrade requiring structural reconstruction.",
    });
  } else if (recurrenceCount12m === 1) {
    score += 10;
  }

  // Clamp final score
  score = Math.min(100, Math.max(10, score));

  // Determine Risk Category & Expected Days to Worsen
  let risk: DeteriorationRisk = DeteriorationRisk.LOW;
  let expectedDaysToWorsen = 21;

  if (score >= 70) {
    risk = DeteriorationRisk.HIGH;
    expectedDaysToWorsen = score >= 85 ? 3 : 5;
  } else if (score >= 40) {
    risk = DeteriorationRisk.MED;
    expectedDaysToWorsen = 10;
  } else {
    risk = DeteriorationRisk.LOW;
    expectedDaysToWorsen = 21;
  }

  const primaryDriverText = drivers.length > 0
    ? drivers.map((d) => d.name).slice(0, 3).join(", ")
    : "Standard traffic wear";

  const explanation = `${risk} deterioration risk (score ${score}/100, expected to worsen within ${expectedDaysToWorsen} days). Key drivers: ${primaryDriverText}.`;

  return {
    risk,
    score,
    expectedDaysToWorsen,
    drivers,
    explanation,
  };
}

/**
 * Assesses deterioration for a single issue from database context.
 */
export async function assessIssueDeterioration(issueId: string): Promise<DeteriorationResult | null> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      category: true,
      sizeClass: true,
      segmentId: true,
      wardId: true,
      createdAt: true,
      segment: {
        select: {
          id: true,
          roadClass: true,
          busesPerHour: true,
        },
      },
      trafficProfiles: {
        where: { dayType: "WEEKDAY", hour: 18 },
        select: { delayRatio: true },
        take: 1,
      },
    },
  });

  if (!issue) return null;

  // Past 7 days rainfall sum for this ward / pilot
  const now = new Date();
  const past7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const next72h = new Date(now.getTime() + 72 * 3600 * 1000);
  const pointKey = issue.wardId || "pilot";

  const weatherRows = await prisma.weatherForecast.findMany({
    where: {
      pointKey,
      hour: {
        gte: past7d,
        lte: next72h,
      },
    },
    select: { hour: true, precipMm: true },
  });

  let past7DaysRainMm = 0;
  let forecast72hRainMm = 0;
  for (const w of weatherRows) {
    if (w.hour < now) {
      past7DaysRainMm += w.precipMm;
    } else {
      forecast72hRainMm += w.precipMm;
    }
  }

  // Count recurring issues in the last 12 months on this segment
  let recurrenceCount12m = 0;
  if (issue.segmentId) {
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    recurrenceCount12m = await prisma.issue.count({
      where: {
        segmentId: issue.segmentId,
        id: { not: issue.id },
        createdAt: { gte: oneYearAgo },
      },
    });
  }

  const delayRatio = issue.trafficProfiles?.[0]?.delayRatio ?? 0.15;

  const result = computeDeterioration({
    category: issue.category,
    sizeClass: issue.sizeClass,
    roadClass: issue.segment?.roadClass,
    busesPerHour: issue.segment?.busesPerHour || 0,
    delayRatio,
    past7DaysRainMm,
    forecast72hRainMm,
    recurrenceCount12m,
  });

  // Calculate and recompute best repair window
  const rw = await recomputeAndSaveBestRepairWindow(issue.id).catch(() => null);
  const bestWindowData = rw
    ? {
        start: rw.start,
        end: rw.end,
        score: rw.score,
        reason: rw.condition || "Optimal window",
        condition: rw.condition,
        display: rw.display,
        basis: rw.basis,
        sampleCount: rw.sampleCount,
        dayType: rw.dayType,
      }
    : undefined;

  // Persist to Issue
  await prisma.issue.update({
    where: { id: issue.id },
    data: {
      deteriorationRisk: result.risk,
      deteriorationScore: result.score,
      expectedDaysToWorsen: result.expectedDaysToWorsen,
      deteriorationDrivers: result.drivers as any,
      ...(bestWindowData ? { bestRepairWindow: bestWindowData } : {}),
    },
  });

  return result;
}

export interface DailyInsightsResult {
  assessedIssuesCount: number;
  hotspotsDetected: number;
  warrantyRiskCount: number;
  timestamp: string;
}

/**
 * Scheduled job 'insights' (daily, 05:00):
 * - Computes deterioration for all OPEN / IN_PROGRESS issues.
 * - Detects recurring defect hotspots: segment with >= 3 issues in 90 days (flags segment and issue: isHotspot: true).
 * - Contractor warranty risk: repairs near warranty expiry (within 30 days of warrantyUntil) with score > 50.
 */
export async function runDailyInsightsJob(): Promise<DailyInsightsResult> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);

  // 1. Fetch active issues
  const openIssues = await prisma.issue.findMany({
    where: {
      status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED] },
    },
    select: { id: true, segmentId: true },
  });

  let assessedCount = 0;
  for (const issue of openIssues) {
    await assessIssueDeterioration(issue.id);
    assessedCount++;
  }

  // 2. Identify Hotspot Segments (>= 3 issues created in 90 days)
  const segmentCounts = await prisma.issue.groupBy({
    by: ["segmentId"],
    where: {
      segmentId: { not: null },
      createdAt: { gte: ninetyDaysAgo },
    },
    _count: { id: true },
    having: {
      segmentId: {
        _count: { gte: 3 },
      },
    },
  });

  const hotspotSegmentIds = segmentCounts
    .map((s) => s.segmentId)
    .filter((id): id is string => id !== null);

  // Update RoadSegment.isHotspot
  if (hotspotSegmentIds.length > 0) {
    await prisma.roadSegment.updateMany({
      where: { id: { in: hotspotSegmentIds } },
      data: { isHotspot: true },
    });

    // Mark current issues on these segments as isHotspot = true
    await prisma.issue.updateMany({
      where: { segmentId: { in: hotspotSegmentIds } },
      data: { isHotspot: true },
    });
  }

  // 3. Contractor Warranty Risk (within 30 days of warrantyUntil and deteriorationScore > 50)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const warrantyRisks = await prisma.issue.findMany({
    where: {
      warrantyUntil: {
        gte: now,
        lte: thirtyDaysFromNow,
      },
      deteriorationScore: { gt: 50 },
    },
    select: { id: true },
  });

  return {
    assessedIssuesCount: assessedCount,
    hotspotsDetected: hotspotSegmentIds.length,
    warrantyRiskCount: warrantyRisks.length,
    timestamp: now.toISOString(),
  };
}
