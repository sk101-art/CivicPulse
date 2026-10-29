export interface ClaimRecord {
  id: string;
  issueId: string;
  actorId: string;
  actorEmail?: string;
  actorName?: string;
  wardId?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  claimedAt: Date;
  verifiedAt?: Date | null;
  disputedAt?: Date | null;
  verdict?: "FIXED" | "NOT_FIXED" | "PENDING";
}

export interface ClaimGapGroupStats {
  id: string;
  code?: string;
  name: string;
  claimed: number;
  verified: number;
  disputed: number;
  pending: number;
  disputedShare: number; // 0.0 to 1.0
  disputedPercentage: number; // 0 to 100
  medianHoursToVerify: number | null;
  insufficientData: boolean;
}

export function computeMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return Math.round(sorted[mid] * 10) / 10;
  }
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

export function aggregateClaimGap(
  records: ClaimRecord[],
  id: string,
  name: string,
  code?: string
): ClaimGapGroupStats {
  const claimed = records.length;
  let verified = 0;
  let disputed = 0;
  let pending = 0;
  const verificationDurations: number[] = [];

  for (const r of records) {
    if (r.verdict === "FIXED" || (r.verifiedAt && !r.disputedAt)) {
      verified++;
      if (r.verifiedAt) {
        const diffHours = (new Date(r.verifiedAt).getTime() - new Date(r.claimedAt).getTime()) / (3600 * 1000);
        if (diffHours >= 0.1) verificationDurations.push(diffHours);
      }
    } else if (r.verdict === "NOT_FIXED" || r.disputedAt) {
      disputed++;
    } else {
      pending++;
    }
  }

  const disputedShare = claimed > 0 ? disputed / claimed : 0;
  const disputedPercentage = Math.round(disputedShare * 1000) / 10;
  // If there are no verified claims, verification time is null
  const medianHoursToVerify = verified > 0 && verificationDurations.length > 0 ? computeMedian(verificationDurations) : null;
  const insufficientData = claimed < 5;

  return {
    id,
    code,
    name,
    claimed,
    verified,
    disputed,
    pending,
    disputedShare,
    disputedPercentage,
    medianHoursToVerify,
    insufficientData,
  };
}
