import { haversineDistanceM } from "@/lib/evidence/sign";

export interface VerificationEligibilityInput {
  isLoggedIn: boolean;
  isReporter?: boolean;
  isClaimant?: boolean;
  accountCreatedAt?: Date | string | null;
  hasVerified?: boolean;
  distanceM?: number | null;
  now?: number;
}

export interface VerificationEligibilityResult {
  eligible: boolean;
  reason?: string;
  remainingHours?: number;
  distanceM?: number;
}

/**
 * Calculates citizen eligibility to verify or dispute a claimed fix on an issue.
 * Evaluates rules in prioritized order:
 * 1. Must be logged in -> "Not logged in"
 * 2. Cannot be the original reporter -> "You reported this issue"
 * 3. Cannot have already submitted a verification -> "Already verified by you"
 * 4. Cannot be the desk officer who claimed the fix -> "Desk officer who claimed this fix cannot verify it"
 * 5. Account must be >= 24 hours old -> "Your account must be at least 24 hours old (eligible in X h)"
 * 6. Must be within 50 m of defect coordinates -> "You must be within 50 m of the issue"
 */
export function getVerificationEligibility(
  input: VerificationEligibilityInput
): VerificationEligibilityResult {
  if (!input.isLoggedIn) {
    return {
      eligible: false,
      reason: "Not logged in",
    };
  }

  if (input.isReporter) {
    return {
      eligible: false,
      reason: "You reported this issue",
    };
  }

  if (input.hasVerified) {
    return {
      eligible: false,
      reason: "Already verified by you",
    };
  }

  if (input.isClaimant) {
    return {
      eligible: false,
      reason: "Desk officer who claimed this fix cannot verify it",
    };
  }

  if (input.accountCreatedAt) {
    const now = input.now ?? Date.now();
    const created = new Date(input.accountCreatedAt).getTime();
    const ageMs = now - created;
    const requiredMs = 24 * 3600 * 1000;
    if (ageMs < requiredMs) {
      const remainingMs = requiredMs - ageMs;
      const remainingHours = Math.max(1, Math.ceil(remainingMs / (3600 * 1000)));
      return {
        eligible: false,
        reason: `Your account must be at least 24 hours old (eligible in ${remainingHours} h)`,
        remainingHours,
      };
    }
  }

  if (typeof input.distanceM === "number" && input.distanceM > 50) {
    return {
      eligible: false,
      reason: "You must be within 50 m of the issue",
      distanceM: input.distanceM,
    };
  }

  return { eligible: true };
}

export function computeDistanceM(
  issueCoords: { lat: number; lng: number },
  userCoords: { lat: number; lng: number }
): number {
  return haversineDistanceM(issueCoords.lat, issueCoords.lng, userCoords.lat, userCoords.lng);
}
