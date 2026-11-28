/**
 * Centralized GPS accuracy and capture-to-issue distance limits for all
 * evidence roles (REPORT, AUDIT, CLAIM_FIX).
 *
 * Both maximums are inclusive (<= 500m accepted, > 500m rejected).
 * The 30m threshold is a non-blocking UI warning only.
 */
export const MAX_GPS_ACCURACY_METERS = 500;
export const MAX_EVIDENCE_DISTANCE_METERS = 500;

export const GPS_ACCURACY_WARNING_THRESHOLD_METERS = 30;
export const EVIDENCE_DISTANCE_WARNING_THRESHOLD_METERS = 30;

export function isValidGpsAccuracy(accuracy: number): boolean {
  return (
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MAX_GPS_ACCURACY_METERS
  );
}

export function isWithinEvidenceDistance(distanceM: number): boolean {
  return (
    typeof distanceM === "number" &&
    Number.isFinite(distanceM) &&
    distanceM >= 0 &&
    distanceM <= MAX_EVIDENCE_DISTANCE_METERS
  );
}

export function getGpsAccuracyWarning(accuracy: number): string | null {
  if (!Number.isFinite(accuracy) || accuracy <= GPS_ACCURACY_WARNING_THRESHOLD_METERS) {
    return null;
  }
  const rounded = Math.round(accuracy);
  return `Your location accuracy is approximately ${rounded} metres. Please confirm the issue location carefully.`;
}

export function getEvidenceDistanceWarning(distanceM: number): string | null {
  if (!Number.isFinite(distanceM) || distanceM <= EVIDENCE_DISTANCE_WARNING_THRESHOLD_METERS) {
    return null;
  }
  const rounded = Math.round(distanceM);
  return `You are approximately ${rounded} metres from the reported issue location. Please ensure your evidence clearly shows the correct site.`;
}
