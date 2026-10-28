import { PRIORITY_CONFIG, PriorityConfig } from "@/config/priority";
import { computeSeverity, SeverityInputs } from "./factors/severity";
import { computeExposure, ExposureInputs } from "./factors/exposure";
import { computeVulnerability, VulnerabilityInputs } from "./factors/vulnerability";
import { computeUsability, UsabilityInputs } from "./factors/usability";
import { computePersistence, PersistenceInputs } from "./factors/persistence";
import { computeConfidence, ConfidenceInputs } from "./factors/confidence";
import { computeSeasonFactor, SeasonIST } from "./season";

export type PriorityBand = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PriorityInputs
  extends SeverityInputs,
    ExposureInputs,
    VulnerabilityInputs,
    UsabilityInputs,
    PersistenceInputs,
    ConfidenceInputs {
  createdAt?: Date | null;
  forecastRainMm72h?: number;
  isEventDay?: boolean;
}

export interface PriorityBreakdown {
  s: number;
  e: number;
  v: number;
  u: number;
  p: number;
  c: number;
  seasonMultiplier: number;
  season: SeasonIST;
  rainMultiplier: number;
  eventMultiplier: number;
  qExposure: number;
  rawPi: number;
  finalPi: number;
  band: PriorityBand;
  isFloorApplied: boolean;
  missing: string[];
}

export interface SentenceFacts {
  summary: string;
  details: string[];
}

export interface PriorityCalculationResult {
  pi: number;
  band: PriorityBand;
  breakdown: PriorityBreakdown;
  sentenceFacts: SentenceFacts;
}

/**
 * Pure function computing the CivicPulse Priority Index and Band.
 * Follows PLAN.md Appendix A specifications strictly. No I/O inside.
 */
export function computePriority(
  inputs: PriorityInputs,
  config: PriorityConfig = PRIORITY_CONFIG,
  now: Date = new Date()
): PriorityCalculationResult {
  const allMissing: string[] = [];

  // 1. Severity (S)
  const sevResult = computeSeverity(inputs, config);
  allMissing.push(...sevResult.missing);

  // 2. Exposure (E)
  const expResult = computeExposure(inputs, config);
  allMissing.push(...expResult.missing);

  // 3. Vulnerability (V)
  const vulnResult = computeVulnerability(inputs, config);
  allMissing.push(...vulnResult.missing);

  // 4. Usability (U)
  const usabResult = computeUsability(inputs, config);
  allMissing.push(...usabResult.missing);

  // Calculate ageHours if createdAt provided and ageHours not explicitly set
  let effectiveAgeHours = inputs.ageHours;
  if (effectiveAgeHours === undefined || effectiveAgeHours === null) {
    if (inputs.createdAt) {
      const elapsedMs = Math.max(0, now.getTime() - inputs.createdAt.getTime());
      effectiveAgeHours = elapsedMs / (3600 * 1000);
    } else {
      effectiveAgeHours = 0;
      allMissing.push("ageHours_or_createdAt");
    }
  }

  // 5. Persistence (P)
  const persResult = computePersistence(
    {
      ...inputs,
      ageHours: effectiveAgeHours,
    },
    config
  );
  allMissing.push(...persResult.missing);

  // 6. Confidence (C)
  const confResult = computeConfidence(inputs, config);
  allMissing.push(...confResult.missing);

  // 7. Season multiplier (Σ)
  const seasonResult = computeSeasonFactor(
    {
      category: inputs.category,
      now,
      forecastRainMm72h: inputs.forecastRainMm72h,
      isEventDay: inputs.isEventDay,
    },
    config
  );

  // Weighted Core Factor Sum
  const weightedSum =
    config.weights.severity * sevResult.s +
    config.weights.exposure * expResult.e +
    config.weights.vulnerability * vulnResult.v +
    config.weights.usability * usabResult.u +
    config.weights.persistence * persResult.p;

  // Raw PI = 100 × C × Σ × (0.30S + 0.20E + 0.15V + 0.20U + 0.15P)
  const rawPi = 100 * confResult.c * seasonResult.seasonFactor * weightedSum;

  let finalPi = Math.min(100, rawPi);

  // Floor rule: if ageHours > 2 × slaHours then PI = max(PI, 60)
  const slaHours = inputs.slaHours || config.defaultSlaHours;
  let isFloorApplied = false;
  if (effectiveAgeHours > config.ageFloorSlaMultiplier * slaHours) {
    if (finalPi < config.ageFloorMinPi) {
      finalPi = config.ageFloorMinPi;
      isFloorApplied = true;
    }
  }

  finalPi = Math.round(finalPi * 10) / 10;
  const roundedRawPi = Math.round(rawPi * 10) / 10;

  // Determine Band
  let band: PriorityBand = "LOW";
  if (finalPi >= config.bands.critical) {
    band = "CRITICAL";
  } else if (finalPi >= config.bands.high) {
    band = "HIGH";
  } else if (finalPi >= config.bands.medium) {
    band = "MEDIUM";
  }

  const breakdown: PriorityBreakdown = {
    s: sevResult.s,
    e: expResult.e,
    v: vulnResult.v,
    u: usabResult.u,
    p: persResult.p,
    c: confResult.c,
    seasonMultiplier: seasonResult.seasonFactor,
    season: seasonResult.season,
    rainMultiplier: seasonResult.rainMultiplier,
    eventMultiplier: seasonResult.eventMultiplier,
    qExposure: expResult.q,
    rawPi: roundedRawPi,
    finalPi,
    band,
    isFloorApplied,
    missing: Array.from(new Set(allMissing)),
  };

  const details: string[] = [
    `Severity: ${(sevResult.s * 100).toFixed(0)}% (${inputs.category}, size: ${inputs.sizeClass || "default"}, pos: ${inputs.lanePosition || "default"})`,
    `Exposure: ${(expResult.e * 100).toFixed(0)}% (road: ${inputs.roadClass || "default"}, ${inputs.lanes || "default"} lanes, ${inputs.busesPerHour || 0} buses/h)`,
    `Vulnerability: ${(vulnResult.v * 100).toFixed(0)}% (road/POI vulnerability)`,
    `Usability: ${(usabResult.u * 100).toFixed(0)}% (blocked: ${inputs.blockedShare || "none"})`,
    `Persistence: ${(persResult.p * 100).toFixed(0)}% (open ${effectiveAgeHours.toFixed(0)}h / SLA ${slaHours}h)`,
    `Confidence: ${(confResult.c * 100).toFixed(0)}% (${confResult.n} distinct user reports)`,
    `Season multiplier: ${seasonResult.seasonFactor.toFixed(2)}x (${seasonResult.season}, rain: ${seasonResult.rainMultiplier}x)`,
  ];

  if (isFloorApplied) {
    details.push("SLA breached (> 2x SLA): minimum floor of 60 enforced.");
  }

  const summary = `${band} priority (${finalPi.toFixed(1)}) — ${inputs.category} on ${inputs.roadClass || "unclassified road"}`;

  return {
    pi: finalPi,
    band,
    breakdown,
    sentenceFacts: {
      summary,
      details,
    },
  };
}

/**
 * Resolves PriorityBand from a 0–100 Priority Index (PI).
 */
export function getPriorityBand(pi: number, config: PriorityConfig = PRIORITY_CONFIG): PriorityBand {
  const normalizedPi = pi <= 1.0 && pi > 0 ? pi * 100 : pi;
  if (normalizedPi >= config.bands.critical) {
    return "CRITICAL";
  } else if (normalizedPi >= config.bands.high) {
    return "HIGH";
  } else if (normalizedPi >= config.bands.medium) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Normalizes and formats a Priority Index score (0–100) and its band.
 */
export function formatPriority(rawPi: number | null | undefined): {
  score: number;
  scoreFormatted: string;
  band: PriorityBand;
} {
  const num = typeof rawPi === "number" && !isNaN(rawPi) ? rawPi : 0;
  const normalized = num <= 1.0 && num > 0 ? num * 100 : num;
  const clamped = Math.max(0, Math.min(100, normalized));
  const band = getPriorityBand(clamped);
  return {
    score: Math.round(clamped * 10) / 10,
    scoreFormatted: clamped.toFixed(1),
    band,
  };
}

export { computeSeverity } from "./factors/severity";
export { computeExposure } from "./factors/exposure";
export { computeVulnerability } from "./factors/vulnerability";
export { computeUsability } from "./factors/usability";
export { computePersistence } from "./factors/persistence";
export { computeConfidence } from "./factors/confidence";
export { getSeasonIST, computeSeasonFactor } from "./season";
