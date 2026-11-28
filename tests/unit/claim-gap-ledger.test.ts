import { describe, it, expect } from 'vitest';
import { aggregateClaimGap, type ClaimRecord } from '@/lib/issues/claimGap';
import { GET } from '@/app/api/claim-gap/route';

describe('Claim Gap Ledger & Ward Scorecard Aggregation', () => {
  it('categorizes verified, disputed, reopened, awaiting verification, and deduplicates by issueId', () => {
    const now = new Date('2026-11-25T12:00:00.000Z');
    const claimedAt = new Date('2026-11-24T12:00:00.000Z');

    const records: ClaimRecord[] = [
      { id: 'c1', issueId: 'iss-1', actorId: 'desk-1', claimedAt, verifiedAt: now, verdict: 'FIXED' },
      { id: 'c2', issueId: 'iss-2', actorId: 'desk-1', claimedAt, disputedAt: now, verdict: 'NOT_FIXED' },
      { id: 'c3', issueId: 'iss-3', actorId: 'desk-1', claimedAt, reopenedAt: now, verdict: 'REOPENED' },
      { id: 'c4', issueId: 'iss-4', actorId: 'desk-1', claimedAt, verdict: 'PENDING' },
      { id: 'c5', issueId: 'iss-5', actorId: 'desk-1', claimedAt, verifiedAt: now, verdict: 'FIXED' },
      // Duplicate row for iss-2 (e.g. multiple evidence/action rows) -> must be counted once
      { id: 'c2-dup', issueId: 'iss-2', actorId: 'desk-1', claimedAt, disputedAt: now, verdict: 'NOT_FIXED' },
    ];

    const stats = aggregateClaimGap(records, 'ward-1', 'Ward 1 · Test', 'GBA-TEST-001');
    expect(stats.claimed).toBe(5);
    expect(stats.verified).toBe(2);
    expect(stats.disputed).toBe(1);
    expect(stats.reopened).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.disputedPercentage).toBe(20);
    expect(stats.insufficientData).toBe(false);
    expect(stats.statusLabel).toBe('High Claim Gap');
  });

  it('marks wards with < 5 claims (including 0 claims) as Insufficient Data rather than Compliant', () => {
    const zero = aggregateClaimGap([], 'ward-0', 'Ward 0', 'GBA-TEST-000');
    expect(zero.claimed).toBe(0);
    expect(zero.insufficientData).toBe(true);
    expect(zero.statusLabel).toBe('Insufficient Data');
  });

  it('GET /api/claim-gap returns consistent summary, distinct records, and matching Ward Scorecard totals', async () => {
    for (const days of [7, 30, 90]) {
      const req = new Request(`http://localhost:3000/api/claim-gap?days=${days}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.periodDays).toBe(days);
      expect(json.summary.totalClaims).toBe(json.records.length);
      expect(
        json.summary.verified +
          json.summary.disputed +
          json.summary.reopened +
          json.summary.awaitingVerification
      ).toBe(json.summary.totalClaims);

      // Distinct issue IDs only
      const ids = json.records.map((r: any) => r.id);
      expect(new Set(ids).size).toBe(ids.length);

      // Ward Scorecard totals must match summary.totalClaims
      const wardTotal = json.byWard.reduce((acc: number, w: any) => acc + w.claimed, 0);
      expect(wardTotal).toBe(json.summary.totalClaims);

      // Every returned record's lifecycle date must fall within the requested days window (and not be future-dated)
      const nowMs = Date.now();
      const thresholdMs = new Date(json.thresholdDate).getTime();
      for (const rec of json.records) {
        const lifecycleIso =
          rec.outcome === 'REOPENED'
            ? rec.reopenedAt || rec.claimedAt
            : rec.outcome === 'NOT_FIXED'
              ? rec.disputedAt || rec.claimedAt
              : rec.outcome === 'FIXED'
                ? rec.verifiedAt || rec.claimedAt
                : rec.claimedAt;
        const lifecycleMs = new Date(lifecycleIso).getTime();
        expect(lifecycleMs).toBeGreaterThanOrEqual(thresholdMs - 5000);
        expect(lifecycleMs).toBeLessThanOrEqual(nowMs + 5000);
      }
    }
  });
});
