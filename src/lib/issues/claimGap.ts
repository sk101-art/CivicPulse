export interface ClaimRecord {
  id: string;
  issueId: string;
  actorId: string;
  actorName?: string;
  wardId?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  claimedAt: Date;
  verifiedAt?: Date | null;
  disputedAt?: Date | null;
  reopenedAt?: Date | null;
  verdict?: 'FIXED' | 'NOT_FIXED' | 'REOPENED' | 'PENDING';
}

export interface ClaimGapGroupStats {
  id: string;
  code?: string;
  name: string;
  claimed: number;
  verified: number;
  disputed: number;
  reopened: number;
  pending: number;
  disputedShare: number; // 0.0 to 1.0 (disputed / claimed)
  disputedPercentage: number; // 0 to 100
  medianHoursToVerify: number | null;
  insufficientData: boolean;
  statusLabel: 'Insufficient Data' | 'Compliant' | 'Watch' | 'High Claim Gap';
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

/**
 * Aggregates distinct issue claim records.
 * Claim Gap Rate = disputed / claimed (preserved existing definition).
 * Wards with < 5 claims are marked 'Insufficient Data' rather than 'Compliant'.
 */
export function aggregateClaimGap(
  records: ClaimRecord[],
  id: string,
  name: string,
  code?: string
): ClaimGapGroupStats {
  const distinctMap = new Map<string, ClaimRecord>();
  for (const r of records) {
    if (!distinctMap.has(r.issueId)) {
      distinctMap.set(r.issueId, r);
    }
  }
  const distinctRecords = Array.from(distinctMap.values());

  const claimed = distinctRecords.length;
  let verified = 0;
  let disputed = 0;
  let reopened = 0;
  let pending = 0;
  const verificationDurations: number[] = [];

  for (const r of distinctRecords) {
    if (r.verdict === 'REOPENED' || r.reopenedAt) {
      reopened++;
    } else if (r.verdict === 'NOT_FIXED' || r.disputedAt) {
      disputed++;
    } else if (r.verdict === 'FIXED' || (r.verifiedAt && !r.disputedAt)) {
      verified++;
      if (r.verifiedAt) {
        const diffHours =
          (new Date(r.verifiedAt).getTime() - new Date(r.claimedAt).getTime()) / (3600 * 1000);
        if (diffHours >= 0.1) verificationDurations.push(diffHours);
      }
    } else {
      pending++;
    }
  }

  const disputedShare = claimed > 0 ? disputed / claimed : 0;
  const disputedPercentage = Math.round(disputedShare * 1000) / 10;
  const medianHoursToVerify =
    verified > 0 && verificationDurations.length > 0 ? computeMedian(verificationDurations) : null;
  const insufficientData = claimed < 5;

  const statusLabel: ClaimGapGroupStats['statusLabel'] = insufficientData
    ? 'Insufficient Data'
    : disputedPercentage >= 20
      ? 'High Claim Gap'
      : disputedPercentage >= 10
        ? 'Watch'
        : 'Compliant';

  return {
    id,
    code,
    name,
    claimed,
    verified,
    disputed,
    reopened,
    pending,
    disputedShare,
    disputedPercentage,
    medianHoursToVerify,
    insufficientData,
    statusLabel,
  };
}
