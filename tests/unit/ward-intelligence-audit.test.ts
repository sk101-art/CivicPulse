import { describe, it, expect, vi, beforeEach } from "vitest";
import { Band, Category, Role, Status } from "@prisma/client";
import {
  computeWardOverviewMetrics,
  getWardIntelligence,
} from "@/lib/intelligence/wardAnalytics";
import { prisma } from "@/lib/db/prisma";

describe("Page 5 — Ward Intelligence KPI, Resolution Time & Sync Audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("computeWardOverviewMetrics deduplicates issues and excludes VERIFIED_FIXED from critical/high and SLA breached", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 48 * 3600 * 1000);

    const metrics = computeWardOverviewMetrics(
      [
        {
          id: "iss-1",
          status: Status.OPEN,
          band: Band.CRITICAL,
          bandOverride: null,
          slaBreached: true,
          slaDueAt: past,
        },
        // Duplicate join row for iss-1
        {
          id: "iss-1",
          status: Status.OPEN,
          band: Band.CRITICAL,
          bandOverride: null,
          slaBreached: true,
          slaDueAt: past,
        },
        {
          id: "iss-2",
          status: Status.CLAIMED_FIXED,
          band: Band.HIGH,
          bandOverride: null,
          slaBreached: false,
          slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000),
        },
        {
          id: "iss-3",
          status: Status.VERIFIED_FIXED,
          band: Band.CRITICAL,
          bandOverride: null,
          slaBreached: true,
          slaDueAt: past,
        },
      ],
      now
    );

    expect(metrics).toEqual({
      totalIssues: 3,
      activeIssues: 1,
      verifiedResolvedIssues: 1,
      awaitingVerificationIssues: 1,
      criticalHighIssues: 2, // iss-1 (OPEN) + iss-2 (CLAIMED_FIXED), excludes iss-3 (VERIFIED_FIXED)
      slaBreachedIssues: 1, // iss-1 only, excludes iss-3 (VERIFIED_FIXED)
    });
  });

  it("getWardIntelligence measures avgResolutionTimeHours strictly from VERIFIED_FIXED (never CLAIMED_FIXED)", async () => {
    const now = new Date();
    const t0 = new Date(now.getTime() - 72 * 3600 * 1000);
    const tClaim = new Date(now.getTime() - 48 * 3600 * 1000);
    const tVerify = new Date(now.getTime() - 24 * 3600 * 1000);

    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      {
        id: "iss-claimed-only",
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        band: Band.HIGH,
        bandOverride: null,
        priority: 70,
        lat: 12.95,
        lng: 77.7,
        address: "ORR",
        wardId: "w1",
        slaBreached: false,
        slaDueAt: now,
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: tClaim,
        createdAt: t0,
        updatedAt: tClaim,
        agency: null,
        reports: [],
        actions: [{ id: "a1", action: "CLAIM_FIX", toStatus: Status.CLAIMED_FIXED, createdAt: tClaim }],
        _count: { reports: 1, verifications: 0, comments: 0 },
      },
      {
        id: "iss-verified",
        category: Category.DRAINAGE,
        status: Status.VERIFIED_FIXED,
        band: Band.MEDIUM,
        bandOverride: null,
        priority: 50,
        lat: 12.96,
        lng: 77.71,
        address: "Marathahalli",
        wardId: "w1",
        slaBreached: false,
        slaDueAt: now,
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: tClaim,
        createdAt: t0,
        updatedAt: tVerify,
        agency: null,
        reports: [],
        actions: [{ id: "a2", action: "VERIFY_FIX", toStatus: Status.VERIFIED_FIXED, createdAt: tVerify }],
        _count: { reports: 2, verifications: 2, comments: 0 },
      },
    ] as never);

    vi.spyOn(prisma.ward, "findMany").mockResolvedValue([] as never);

    const data = await getWardIntelligence("ALL", "30d", Role.AUTHORITY);
    expect(data).not.toBeNull();
    // Only iss-verified (tVerify - t0 = 48h) counts toward resolution time, NOT iss-claimed-only (24h)!
    expect(data!.resolutionPerformance.avgResolutionTimeHours).toBe(48);
    expect(data!.resolutionPerformance.claimedFixedCount).toBe(1);
    expect(data!.resolutionPerformance.resolvedReports).toBe(1);
  });
});
