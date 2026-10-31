/**
 * Traffic Congestion & Road Class Mapping Utilities.
 * Handles congestion ratio calculation, median sample aggregation, and TomTom FRC mapping.
 */

/**
 * Calculates congestion ratio r = 1 - current/freeFlow clamped to [0, 1].
 * Returns 0 if freeFlowSpeed <= 0 or if values are invalid.
 */
export function calculateCongestionR(
  currentSpeed: number,
  freeFlowSpeed: number
): number {
  if (
    !Number.isFinite(currentSpeed) ||
    !Number.isFinite(freeFlowSpeed) ||
    freeFlowSpeed <= 0
  ) {
    return 0;
  }
  const rawR = 1 - currentSpeed / freeFlowSpeed;
  return Math.max(0, Math.min(1, Math.round(rawR * 1000) / 1000));
}

/**
 * Calculates the median congestion ratio from a list of samples.
 * Returns null if the list is empty.
 */
export function calculateMedianCongestionR(
  samples: Array<{ congestionR: number }>
): number | null {
  if (!samples || samples.length === 0) {
    return null;
  }

  const validValues = samples
    .map((s) => s.congestionR)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (validValues.length === 0) {
    return null;
  }

  const mid = Math.floor(validValues.length / 2);
  let median: number;
  if (validValues.length % 2 === 1) {
    median = validValues[mid];
  } else {
    median = (validValues[mid - 1] + validValues[mid]) / 2;
  }

  return Math.max(0, Math.min(1, Math.round(median * 1000) / 1000));
}

/**
 * Maps TomTom Functional Road Class (FRC0 - FRC6) to CivicPulse roadClass names
 * used by PRIORITY_CONFIG (trunk, primary, secondary, tertiary, residential, service).
 */
export function mapFrcToRoadClass(
  frc: string | null | undefined
): string {
  if (!frc) return "residential";

  const normalized = frc.trim().toUpperCase();
  switch (normalized) {
    case "FRC0":
    case "0":
      return "trunk";
    case "FRC1":
    case "1":
      return "primary";
    case "FRC2":
    case "2":
      return "secondary";
    case "FRC3":
    case "3":
      return "tertiary";
    case "FRC4":
    case "4":
    case "FRC5":
    case "5":
      return "residential";
    case "FRC6":
    case "6":
    case "FRC7":
    case "7":
      return "service";
    default:
      return "residential";
  }
}

import { getHourOfWeekIST as getHourOfWeekISTHelper } from "@/lib/time/ist";

export { getHourOfWeekISTHelper as getHourOfWeekIST };
