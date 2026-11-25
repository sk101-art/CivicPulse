import { describe, it, expect } from 'vitest';
import { Band, Status } from '@prisma/client';
import {
  computeWardOverviewMetrics,
  getWardIntelligence,
  isCriticalOrHighUnresolved,
  isSlaBreachedUnresolved,
} from '@/lib/intelligence/wardAnalytics';
import { prisma } from '@/lib/prisma';

describe('Ward Intelligence KPI Calculations', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');
  const pastDue = new Date('2026-11-24T12:00:00.000Z');
  const futureDue = new Date('2026-11-28T12:00:00.000Z');

  it('counts unresolved Critical/High issues (including CLAIMED_FIXED) and excludes VERIFIED_FIXED, REJECTED, LOW, MEDIUM, and duplicate rows', () => {
    const sampleIssues = [
      // 1. High-priority active issue -> INCLUDED
      { id: 'iss-1', status: Status.OPEN, band: Band.HIGH, bandOverride: null, slaBreached: false, slaDueAt: futureDue },
      // 2. Critical-priority active issue -> INCLUDED (and SLA breached)
      { id: 'iss-2', status: Status.IN_PROGRESS, band: Band.CRITICAL, bandOverride: null, slaBreached: true, slaDueAt: pastDue },
      // 3. High-priority verified fixed issue -> EXCLUDED (even if slaBreached was true historically)
      { id: 'iss-3', status: Status.VERIFIED_FIXED, band: Band.HIGH, bandOverride: null, slaBreached: true, slaDueAt: pastDue },
      // 4. Critical-priority verified fixed issue -> EXCLUDED
      { id: 'iss-4', status: Status.VERIFIED_FIXED, band: Band.CRITICAL, bandOverride: null, slaBreached: false, slaDueAt: futureDue },
      // 5. High-priority issue awaiting verification (CLAIMED_FIXED) -> INCLUDED until independently verified
      { id: 'iss-5', status: Status.CLAIMED_FIXED, band: Band.HIGH, bandOverride: null, slaBreached: false, slaDueAt: futureDue },
      // 6. Low-priority active issue -> EXCLUDED
      { id: 'iss-6', status: Status.ASSIGNED, band: Band.LOW, bandOverride: null, slaBreached: false, slaDueAt: futureDue },
      // 7. Medium-priority active issue -> EXCLUDED
      { id: 'iss-7', status: Status.OPEN, band: Band.MEDIUM, bandOverride: null, slaBreached: false, slaDueAt: pastDue },
      // 8. Duplicate row for iss-1 (e.g. from joined report/action) -> counted only once
      { id: 'iss-1', status: Status.OPEN, band: Band.HIGH, bandOverride: null, slaBreached: false, slaDueAt: futureDue },
      // Rejected critical issue -> EXCLUDED
      { id: 'iss-8', status: Status.REJECTED, band: Band.CRITICAL, bandOverride: null, slaBreached: true, slaDueAt: pastDue },
    ];

    const metrics = computeWardOverviewMetrics(sampleIssues, now);

    expect(metrics.totalIssues).toBe(8);
    expect(metrics.activeIssues).toBe(4); // iss-1, iss-2, iss-6, iss-7
    expect(metrics.verifiedResolvedIssues).toBe(2); // iss-3, iss-4
    expect(metrics.awaitingVerificationIssues).toBe(1); // iss-5
    expect(metrics.criticalHighIssues).toBe(3); // iss-1, iss-2, iss-5
    expect(metrics.slaBreachedIssues).toBe(2); // iss-2, iss-7 (excludes iss-3 & iss-8)
  });

  it('respects bandOverride when determining Critical & High Priority', () => {
    expect(
      isCriticalOrHighUnresolved({ status: Status.OPEN, band: Band.MEDIUM, bandOverride: Band.CRITICAL })
    ).toBe(true);
    expect(
      isCriticalOrHighUnresolved({ status: Status.OPEN, band: Band.HIGH, bandOverride: Band.LOW })
    ).toBe(false);
    expect(
      isCriticalOrHighUnresolved({ status: Status.VERIFIED_FIXED, band: Band.CRITICAL, bandOverride: null })
    ).toBe(false);
  });

  it('excludes VERIFIED_FIXED and REJECTED from SLA Breached even when slaBreached=true', () => {
    expect(
      isSlaBreachedUnresolved({ status: Status.VERIFIED_FIXED, slaBreached: true, slaDueAt: pastDue }, now)
    ).toBe(false);
    expect(
      isSlaBreachedUnresolved({ status: Status.REJECTED, slaBreached: true, slaDueAt: pastDue }, now)
    ).toBe(false);
    expect(
      isSlaBreachedUnresolved({ status: Status.OPEN, slaBreached: false, slaDueAt: pastDue }, now)
    ).toBe(true);
  });

  it('filters by ward and date range in getWardIntelligence against real DB records', async () => {
    const wards = await prisma.ward.findMany({ take: 2, orderBy: { code: 'asc' } });
    expect(wards.length).toBeGreaterThan(0);

    const primaryCode = wards[0].code;
    const dataAll = await getWardIntelligence(primaryCode, 'all', 'AUTHORITY');
    const data7d = await getWardIntelligence(primaryCode, '7d', 'AUTHORITY');

    expect(dataAll).not.toBeNull();
    expect(data7d).not.toBeNull();

    if (wards[1]) {
      const otherWard = await getWardIntelligence(wards[1].code, 'all', 'AUTHORITY');
      expect(otherWard).not.toBeNull();
    }

    if (dataAll && data7d) {
      expect(data7d.overview.totalIssues).toBeLessThanOrEqual(dataAll.overview.totalIssues);
      expect(dataAll.overview.criticalHighIssues).toBeLessThanOrEqual(
        dataAll.overview.activeIssues + dataAll.overview.awaitingVerificationIssues
      );
      expect(dataAll.overview.slaBreachedIssues).toBeLessThanOrEqual(
        dataAll.overview.activeIssues + dataAll.overview.awaitingVerificationIssues
      );

      // Verify distinct issues in DB for WARD-150 match overview
      const dbIssues = await prisma.issue.findMany({
        where: { wardId: dataAll.ward.id },
        select: { id: true, status: true, band: true, bandOverride: true, slaBreached: true, slaDueAt: true },
      });
      const expected = computeWardOverviewMetrics(dbIssues);
      expect(dataAll.overview).toEqual(expected);
    }
  });
});
