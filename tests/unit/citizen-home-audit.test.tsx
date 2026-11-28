import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Status, Category, Tier } from "@prisma/client";
import { ActiveReports } from "@/components/citizen/ActiveReports";
import { CivicContributionCard } from "@/components/citizen/CivicContributionCard";
import { SelectedWardPulse } from "@/components/citizen/SelectedWardPulse";
import { loadCitizenOverview } from "@/lib/citizen/stats";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/context/GeoContext", () => ({
  useGeoContext: () => ({
    currentWard: {
      id: "ward-47",
      code: "47",
      wardLabel: "Ward 47",
      fullName: "Ward 47 • Bellanduru",
    },
    wardData: {
      isLoading: false,
      error: null,
      stats: {
        totalReported: 12,
        inProgressCount: 5,
        resolvedCount: 4,
        criticalCount: 3,
        slaBreachedCount: 1,
      },
      issues: [],
      audits: [],
      categoryBreakdown: {},
    },
  }),
}));

vi.mock("@/hooks/useReports", () => ({
  useReports: (opts: { initialData: unknown[] }) => ({
    reports: opts.initialData,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: () => ({
    isOnline: true,
    pendingCount: 0,
    queueReport: vi.fn(),
    syncReports: vi.fn(),
  }),
}));

describe("Citizen Home Audit & Regression Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loadCitizenOverview returns genuine zeros when citizen has no records", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: "u-empty",
      name: "New Citizen",
      email: "new@test.local",
      citizenProfile: null,
    } as never);
    vi.spyOn(prisma.report, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.report, "count").mockResolvedValue(0 as never);
    vi.spyOn(prisma.auditVote, "count").mockResolvedValue(0 as never);
    vi.spyOn(prisma.verification, "count").mockResolvedValue(0 as never);

    const overview = await loadCitizenOverview("u-empty", { reportLimit: 4 });
    expect(overview.reportsFiled).toBe(0);
    expect(overview.verifiedFixedCount).toBe(0);
    expect(overview.pendingCount).toBe(0);
    expect(overview.votesCast).toBe(0);
    expect(overview.reports).toEqual([]);
  });

  it("loadCitizenOverview separates VERIFIED_FIXED from CLAIMED_FIXED and uses all-time counts", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: "u-1",
      name: "Ravi Kumar",
      email: "ravi@test.local",
      citizenProfile: { tier: Tier.CONTRIBUTOR, reputation: 340 },
    } as never);
    vi.spyOn(prisma.report, "findMany").mockResolvedValue([] as never);
    const countSpy = vi
      .spyOn(prisma.report, "count")
      .mockResolvedValueOnce(15 as never) // reportsFiled
      .mockResolvedValueOnce(5 as never) // verifiedFixedCount (VERIFIED_FIXED only)
      .mockResolvedValueOnce(9 as never); // pendingCount (includes CLAIMED_FIXED, excludes VERIFIED_FIXED/REJECTED)
    vi.spyOn(prisma.auditVote, "count").mockResolvedValue(4 as never);
    vi.spyOn(prisma.verification, "count").mockResolvedValue(2 as never);

    const overview = await loadCitizenOverview("u-1", { reportLimit: 4 });
    expect(overview.reportsFiled).toBe(15);
    expect(overview.verifiedFixedCount).toBe(5);
    expect(overview.pendingCount).toBe(9);
    expect(overview.votesCast).toBe(6);

    const verifiedCall = countSpy.mock.calls[1]?.[0];
    expect(verifiedCall?.where?.issue).toEqual({ status: Status.VERIFIED_FIXED });
    const pendingCall = countSpy.mock.calls[2]?.[0] as { where?: { issue?: { status?: { in?: Status[] } } } };
    expect(pendingCall?.where?.issue?.status?.in).toContain(Status.CLAIMED_FIXED);
    expect(pendingCall?.where?.issue?.status?.in).not.toContain(Status.VERIFIED_FIXED);
  });

  it("ActiveReports shows honest empty state, no Ward Community tab, and real eligible audit count", () => {
    const html = renderToStaticMarkup(
      <ActiveReports initialReports={[]} eligibleAuditCount={3} isAuditEligible={true} />
    );
    expect(html).toContain('data-testid="my-reports-empty"');
    expect(html).toContain('href="/citizen/report"');
    expect(html).toContain('href="/citizen/profile"');
    expect(html).toContain('href="/citizen/audit"');
    expect(html).toContain("3 eligible");
    expect(html).not.toContain("Community Issues");
    expect(html).not.toContain("cp-0184");
    expect(html).not.toContain("Pothole on MG Road");
  });

  it("ActiveReports distinguishes CLAIMED_FIXED (Repair Claimed) from VERIFIED_FIXED (Verified Fixed)", () => {
    const html = renderToStaticMarkup(
      <ActiveReports
        eligibleAuditCount={0}
        isAuditEligible={true}
        initialReports={[
          {
            id: "rep-1",
            issueId: "iss-1",
            title: "Pothole at Indiranagar",
            category: Category.POTHOLES,
            status: Status.CLAIMED_FIXED,
            createdAt: new Date("2026-11-20T10:00:00Z"),
            address: "100ft Road",
            priorityScore: 0.8,
            latitude: 12.97,
            longitude: 77.64,
          },
          {
            id: "rep-2",
            issueId: "iss-2",
            title: "Drainage at Koramangala",
            category: Category.DRAINAGE,
            status: Status.VERIFIED_FIXED,
            createdAt: new Date("2026-11-19T10:00:00Z"),
            address: "80ft Road",
            priorityScore: 0.6,
            latitude: 12.93,
            longitude: 77.62,
          },
        ]}
      />
    );
    expect(html).toContain("Repair Claimed");
    expect(html).toContain("Verified Fixed");
    expect(html).toContain('href="/citizen/report/rep-1"');
    expect(html).toContain('href="/citizen/report/rep-2"');
  });

  it("CivicContributionCard uses real progression rules with zero fake defaults", () => {
    const html = renderToStaticMarkup(
      <CivicContributionCard tier={null} points={0} hasProfile={false} />
    );
    expect(html).toContain("Civic Member");
    expect(html).toContain("0 pts");
    expect(html).toContain("200 pts to Civic Contributor");
    expect(html).toContain('href="/citizen/profile"');
    expect(html).not.toContain("1,280");
    expect(html).not.toContain("Verifications");
  });

  it("SelectedWardPulse renders 3 ward metrics and links without 12-category breakdown", () => {
    const html = renderToStaticMarkup(<SelectedWardPulse />);
    expect(html).toContain("Ward 47 • Bellanduru");
    expect(html).toContain("12");
    expect(html).toContain("8"); // 12 - 4 resolved = 8 active/unresolved
    expect(html).toContain("4");
    expect(html).toContain('href="/citizen/intelligence"');
    expect(html).toContain('href="/citizen/map"');
    expect(html).not.toContain("Ward Category Breakdown");
  });
});
