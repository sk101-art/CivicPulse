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

  it("excludes REJECTED from CategoryMetric.activeCount & resolution denominators, and hides authorityOnly for CITIZEN", async () => {
    const now = new Date();
    const t0 = new Date(now.getTime() - 10 * 24 * 3600 * 1000);

    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      {
        id: "iss-open",
        category: Category.POTHOLES,
        status: Status.OPEN,
        band: Band.HIGH,
        bandOverride: null,
        priority: 75,
        lat: 12.95,
        lng: 77.7,
        address: "Road A",
        wardId: "w1",
        slaBreached: false,
        slaDueAt: new Date(now.getTime() + 48 * 3600 * 1000),
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: null,
        createdAt: t0,
        updatedAt: t0,
        agency: null,
        reports: [],
        actions: [],
        _count: { reports: 1, verifications: 0, comments: 0 },
      },
      {
        id: "iss-rejected",
        category: Category.POTHOLES,
        status: Status.REJECTED,
        band: Band.LOW,
        bandOverride: null,
        priority: 20,
        lat: 12.95,
        lng: 77.7,
        address: "Road A",
        wardId: "w1",
        slaBreached: false,
        slaDueAt: now,
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: null,
        createdAt: t0,
        updatedAt: t0,
        agency: null,
        reports: [],
        actions: [{ id: "ar", action: "REJECT", toStatus: Status.REJECTED, createdAt: t0 }],
        _count: { reports: 1, verifications: 0, comments: 0 },
      },
      {
        id: "iss-ver",
        category: Category.POTHOLES,
        status: Status.VERIFIED_FIXED,
        band: Band.MEDIUM,
        bandOverride: null,
        priority: 50,
        lat: 12.95,
        lng: 77.7,
        address: "Road B",
        wardId: "w1",
        slaBreached: false,
        slaDueAt: now,
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: t0,
        createdAt: t0,
        updatedAt: now,
        agency: null,
        reports: [],
        actions: [{ id: "av", action: "VERIFY_FIX", toStatus: Status.VERIFIED_FIXED, createdAt: now }],
        _count: { reports: 1, verifications: 2, comments: 0 },
      },
    ] as never);

    const citizenData = await getWardIntelligence("ALL", "30d", Role.CITIZEN);
    expect(citizenData).not.toBeNull();
    expect(citizenData!.authorityOnly).toBeUndefined();

    const potholes = citizenData!.categoryAnalysis.find((c) => c.category === Category.POTHOLES);
    expect(potholes?.count).toBe(3);
    expect(potholes?.activeCount).toBe(1); // Only OPEN, NOT REJECTED or VERIFIED_FIXED
    expect(potholes?.resolvedCount).toBe(1);

    // Resolution rate excludes REJECTED: 1 verified / 2 eligible = 50%
    expect(citizenData!.resolutionPerformance.totalReports).toBe(2);
    expect(citizenData!.resolutionPerformance.resolutionRate).toBe(50);

    // Citizen-friendly briefing never uses staff jargon
    const joinedTitles = citizenData!.wardBriefing.recommendedActions.map((a) => a.title).join(" ");
    expect(joinedTitles).not.toContain("Expedite overdue SLA work orders");
    expect(joinedTitles).not.toContain("Conduct engineering review");
  });

  it("historicalTrends reconstructs pre-period backlog, places SLA breaches in due bucket, and supports >365d for 'all'", async () => {
    const now = new Date();
    const oldCreated = new Date(now.getTime() - 400 * 24 * 3600 * 1000); // > 365 days ago
    const recentDue = new Date(now.getTime() - 2 * 24 * 3600 * 1000); // expired 2 days ago (inside 7d)

    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      {
        id: "iss-old-open",
        category: Category.DRAINAGE,
        status: Status.OPEN,
        band: Band.HIGH,
        bandOverride: null,
        priority: 70,
        lat: 12.95,
        lng: 77.7,
        address: "Old Drain",
        wardId: "w1",
        slaBreached: true,
        slaDueAt: recentDue,
        handoffCount: 0,
        isHotspot: false,
        recurrenceOf: null,
        warrantyUntil: null,
        repairClaimedAt: null,
        createdAt: oldCreated,
        updatedAt: now,
        agency: null,
        reports: [],
        actions: [],
        _count: { reports: 1, verifications: 0, comments: 0 },
      },
    ] as never);

    const data7d = await getWardIntelligence("ALL", "7d", Role.CITIZEN);
    expect(data7d).not.toBeNull();
    // Pre-period open issue must still appear in 7d historical backlog and its SLA breach in the due bucket
    const total7dBreaches = data7d!.historicalTrends.timeBuckets.reduce((s, b) => s + b.slaBreaches, 0);
    expect(total7dBreaches).toBe(1);
    expect(data7d!.historicalTrends.timeBuckets[0].backlog).toBe(1);

    const dataAll = await getWardIntelligence("ALL", "all", Role.CITIZEN);
    expect(dataAll).not.toBeNull();
    const totalAllNew = dataAll!.historicalTrends.timeBuckets.reduce((s, b) => s + b.newReports, 0);
    expect(totalAllNew).toBe(1); // >365-day old issue included!
  });

  it("returns genuine zeros and null avgResolutionTimeHours for empty ward dataset", async () => {
    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([] as never);

    const emptyData = await getWardIntelligence("ALL", "30d", Role.CITIZEN);
    expect(emptyData).not.toBeNull();
    expect(emptyData!.overview.totalIssues).toBe(0);
    expect(emptyData!.overview.activeIssues).toBe(0);
    expect(emptyData!.resolutionPerformance.avgResolutionTimeHours).toBeNull();
    expect(emptyData!.resolutionPerformance.resolutionRate).toBe(0);
  });
});
