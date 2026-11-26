import { describe, it, expect, vi, beforeEach } from "vitest";
import { Status } from "@prisma/client";
import {
  getMapStatusMeta,
  matchesStatusFilter,
  buildStatusPinHtml,
} from "@/lib/map/statusPresentation";
import { GET as getWardIssues } from "@/app/api/issues/ward/route";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("Real-Time Map Status Synchronization & Visualization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps every Prisma lifecycle status to Civic Atlas colors, labels, and distinct shapes", () => {
    const open = getMapStatusMeta(Status.OPEN);
    const inProgress = getMapStatusMeta(Status.IN_PROGRESS);
    const claimed = getMapStatusMeta(Status.CLAIMED_FIXED);
    const verified = getMapStatusMeta(Status.VERIFIED_FIXED);
    const disputed = getMapStatusMeta(Status.DISPUTED);
    const reopened = getMapStatusMeta(Status.REOPENED_IN_WARRANTY);

    expect(open.color).toBe("#718F9E");
    expect(inProgress.color).toBe("#B68B63");
    expect(claimed.color).toBe("#527B7A");
    expect(claimed.label).toBe("Repair Claimed — Awaiting Verification");
    expect(verified.color).toBe("#537C60");
    expect(disputed.color).toBe("#B76F60");
    expect(reopened.color).toBe("#B68B63");

    // Distinct shapes for color-vision accessibility
    expect(new Set([open.shape, inProgress.shape, claimed.shape, verified.shape, disputed.shape, reopened.shape]).size).toBe(6);

    // Pin HTML renders with status color
    expect(buildStatusPinHtml(Status.CLAIMED_FIXED, false)).toContain("#527B7A");
    expect(buildStatusPinHtml(Status.VERIFIED_FIXED, true)).toContain("#537C60");
  });

  it("matchesStatusFilter handles all lifecycle states cleanly", () => {
    expect(matchesStatusFilter(Status.OPEN, Status.OPEN)).toBe(true);
    expect(matchesStatusFilter(Status.ASSIGNED, Status.OPEN)).toBe(true);
    expect(matchesStatusFilter(Status.CLAIMED_FIXED, Status.CLAIMED_FIXED)).toBe(true);
    expect(matchesStatusFilter(Status.CLAIMED_FIXED, Status.VERIFIED_FIXED)).toBe(false);
    expect(matchesStatusFilter(Status.DISPUTED, "ALL")).toBe(true);
  });

  it("GET /api/issues/ward reflects CLAIMED_FIXED without counting it as resolved and enforces role visibility", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "cit-1", role: "CITIZEN", email: "c@local" },
    } as never);

    vi.spyOn(prisma.ward, "findFirst").mockResolvedValue({
      id: "ward-150",
      code: "150",
      wardNumber: 150,
      name: "Bellandur",
      isOperationalArea: false,
      corporation: { name: "GBA East" },
    } as never);
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { lat: 12.93, lng: 77.67, min_lat: 12.92, min_lng: 77.66, max_lat: 12.94, max_lng: 77.68, geom_json: null, has_geom: false },
    ] as never);
    vi.spyOn(prisma.issue, "groupBy").mockResolvedValue([] as never);

    const mockIssues = [
      {
        id: "iss-claimed-1",
        category: "POTHOLES",
        status: Status.CLAIMED_FIXED,
        lat: 12.93,
        lng: 77.67,
        address: "Bellandur Gate",
        band: "HIGH",
        bandOverride: null,
        priority: 75,
        slaBreached: false,
        slaDueAt: new Date(),
        repairClaimedAt: new Date(),
        createdAt: new Date(),
        contractorName: "Cauvery Infra",
        agency: { id: "ag-1", code: "BBMP", name: "BBMP Roads" },
        reports: [{ id: "r1", role: "CLAIM_FIX", photoUrl: "/repaired.jpg", createdAt: new Date(), note: "Fixed" }],
        _count: { reports: 2, comments: 0 },
      },
    ];

    vi.spyOn(prisma.issue, "findMany")
      .mockResolvedValueOnce(mockIssues as never)
      .mockResolvedValueOnce([{ id: "iss-claimed-1", status: Status.CLAIMED_FIXED, priority: 75, band: "HIGH", slaBreached: false }] as never);
    vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([] as never);

    const resCitizen = await getWardIssues(
      new Request("http://localhost:3000/api/issues/ward?ward=ward-150")
    );
    expect(resCitizen.status).toBe(200);
    const citizenData = await resCitizen.json();
    expect(citizenData.issues).toHaveLength(1);
    expect(citizenData.issues[0].status).toBe(Status.CLAIMED_FIXED);
    expect(citizenData.issues[0].statusLabel).toBe("Repair Claimed — Awaiting Verification");
    expect(citizenData.issues[0].agencyName).toBeUndefined();
    expect(citizenData.stats.resolvedCount).toBe(0);
  });
});
