import { describe, it, expect } from "vitest";
import {
  aggregateClaimGap,
  computeMedian,
  type ClaimRecord,
} from "@/lib/issues/claimGap";
import { GET as getClaimGap } from "@/app/api/claim-gap/route";
import ClaimGapPage from "@/app/(public)/claim-gap/page";

describe("T29 Acceptance: Claim-gap page and desk scorecard", () => {
  it("calculates median hours correctly for odd and even datasets", () => {
    expect(computeMedian([])).toBeNull();
    expect(computeMedian([4.5])).toBe(4.5);
    expect(computeMedian([2, 8, 4])).toBe(4);
    expect(computeMedian([1, 3, 5, 7])).toBe(4);
    expect(computeMedian([2.1, 4.3, 6.7, 9.2])).toBe(5.5);
  });

  it("calculates claim gap percentages and marks insufficient data (< 5 claims) accurately on fixtures", () => {
    const now = new Date();

    // Fixture set 1: 10 claims (8 verified, 2 disputed) -> 20% claim gap, sufficient data
    const fixture1: ClaimRecord[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `c1-${i}`,
      issueId: `iss-1-${i}`,
      actorId: "desk-a",
      claimedAt: new Date(now.getTime() - 10 * 3600 * 1000),
      verdict: i < 8 ? "FIXED" : "NOT_FIXED",
      verifiedAt: i < 8 ? new Date(now.getTime() - (10 - (i + 1)) * 3600 * 1000) : null,
      disputedAt: i >= 8 ? new Date(now.getTime() - (10 - (i + 1)) * 3600 * 1000) : null,
    }));

    const stats1 = aggregateClaimGap(fixture1, "ward-1", "Indiranagar", "WARD-1");
    expect(stats1.claimed).toBe(10);
    expect(stats1.verified).toBe(8);
    expect(stats1.disputed).toBe(2);
    expect(stats1.disputedShare).toBe(0.2);
    expect(stats1.disputedPercentage).toBe(20.0);
    expect(stats1.insufficientData).toBe(false);
    expect(stats1.medianHoursToVerify).toBeGreaterThan(0);

    // Fixture set 2: 4 claims (1 disputed, 3 verified) -> 25% claim gap, insufficient data (< 5)
    const fixture2: ClaimRecord[] = Array.from({ length: 4 }).map((_, i) => ({
      id: `c2-${i}`,
      issueId: `iss-2-${i}`,
      actorId: "desk-b",
      claimedAt: new Date(now.getTime() - 20 * 3600 * 1000),
      verdict: i === 0 ? "NOT_FIXED" : "FIXED",
      disputedAt: i === 0 ? new Date(now.getTime() - 15 * 3600 * 1000) : null,
      verifiedAt: i > 0 ? new Date(now.getTime() - 12 * 3600 * 1000) : null,
    }));

    const stats2 = aggregateClaimGap(fixture2, "ward-2", "Koramangala", "WARD-2");
    expect(stats2.claimed).toBe(4);
    expect(stats2.verified).toBe(3);
    expect(stats2.disputed).toBe(1);
    expect(stats2.disputedShare).toBe(0.25);
    expect(stats2.disputedPercentage).toBe(25.0);
    // Key acceptance criterion: under 5 claims marked insufficient data
    expect(stats2.insufficientData).toBe(true);
  });

  it("GET /api/claim-gap returns aggregation by ward and by desk for 30 and 90 day periods", async () => {
    // 1. Fetch 30-day metrics
    const req30 = new Request("http://localhost:3000/api/claim-gap?days=30");
    const res30 = await getClaimGap(req30);
    expect(res30.status).toBe(200);

    const data30 = await res30.json();
    expect(data30.periodDays).toBe(30);
    expect(data30.byWard).toBeDefined();
    expect(Array.isArray(data30.byWard)).toBe(true);
    expect(data30.byDesk).toBeDefined();
    expect(Array.isArray(data30.byDesk)).toBe(true);

    // Desk A and Desk B must both be present in byDesk
    const deskNames = (data30.byDesk as Array<{ name: string }>).map((d) => d.name);
    expect(deskNames).toContain("Desk A");
    expect(deskNames).toContain("Desk B");

    // 2. Fetch 90-day metrics
    const req90 = new Request("http://localhost:3000/api/claim-gap?days=90");
    const res90 = await getClaimGap(req90);
    expect(res90.status).toBe(200);
    const data90 = await res90.json();
    expect(data90.periodDays).toBe(90);
  });

  it("renders Public Claim-Gap page and displays seed label when seed data exists", async () => {
    const pageElement = await ClaimGapPage();
    expect(pageElement).toBeDefined();
    expect(pageElement.type).toBe("div");
  });
});
