import "server-only";
import { Prisma, Tier } from "@prisma/client";

export type PointEventType =
  | "NEW_ISSUE"
  | "CONFIRMATION"
  | "VERIFICATION_ACCEPTED"
  | "VERIFICATION_WRONG"
  | "DUPLICATE_MERGE";

export const POINT_VALUES: Record<PointEventType, number> = {
  NEW_ISSUE: 10,
  CONFIRMATION: 5,
  VERIFICATION_ACCEPTED: 20,
  VERIFICATION_WRONG: -20,
  DUPLICATE_MERGE: 0,
} as const;

export interface CalculatePointsInput {
  event: PointEventType;
  isOwnIssue?: boolean;
}

export function calculatePoints(input: CalculatePointsInput): number {
  const { event, isOwnIssue = false } = input;

  if (event === "CONFIRMATION") {
    // Only confirmations of someone else's issue earn +5; own confirmations earn 0
    return isOwnIssue ? 0 : POINT_VALUES.CONFIRMATION;
  }

  return POINT_VALUES[event];
}

export function calculateTier(reputation: number): Tier {
  if (reputation >= 1000) return Tier.AMBASSADOR;
  if (reputation >= 500) return Tier.GUARDIAN;
  if (reputation >= 200) return Tier.CONTRIBUTOR;
  return Tier.CITIZEN;
}

export interface AwardPointsInput {
  userId: string;
  event: PointEventType;
  reason?: string;
  isOwnIssue?: boolean;
}

export interface AwardPointsResult {
  points: number;
  newReputation: number;
  newTier: Tier;
  pointLogId?: string;
}

/**
 * Awards or deducts points for a citizen within the caller's database transaction.
 * Updates CitizenProfile reputation and tier in the same transaction.
 */
export async function awardPoints(
  tx: Prisma.TransactionClient,
  input: AwardPointsInput
): Promise<AwardPointsResult | null> {
  const { userId, event, reason, isOwnIssue = false } = input;

  const profile = await tx.citizenProfile.findUnique({
    where: { userId },
  });

  // If user has no citizen profile (e.g. Authority role), no points awarded
  if (!profile) {
    return null;
  }

  const points = calculatePoints({ event, isOwnIssue });

  if (points === 0) {
    return {
      points: 0,
      newReputation: profile.reputation,
      newTier: profile.tier,
    };
  }

  const newReputation = Math.max(0, profile.reputation + points);
  const newTier = calculateTier(newReputation);

  const defaultReason = reason || `Civic activity: ${event.toLowerCase().replace(/_/g, " ")}`;

  const pointLog = await tx.pointLog.create({
    data: {
      citizenId: profile.id,
      points,
      reason: defaultReason,
    },
  });

  await tx.citizenProfile.update({
    where: { id: profile.id },
    data: {
      reputation: newReputation,
      tier: newTier,
    },
  });

  return {
    points,
    newReputation,
    newTier,
    pointLogId: pointLog.id,
  };
}
