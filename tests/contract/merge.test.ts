import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ingestReportWithSpatialMerge } from "@/lib/issues/merge";
import { Category, EvidenceRole } from "@prisma/client";

describe("T14 Contract Test: Spatial Deduplication & Merge", () => {
  let testUserId: string;

  // Unseeded reference coordinates in Bengaluru pilot area (Yeshwanthpur area)
  const baseLat = 13.050000;
  const baseLng = 77.550000;

  // 1 degree latitude ~ 111,139 metres
  // 10 m ~ 0.000090 deg
  // 30 m ~ 0.000270 deg
  // 70 m ~ 0.000630 deg
  const lat10m = baseLat + 0.000090;
  const lat30mSouth = baseLat - 0.000270;
  const lng70mEast = baseLng + 0.000630;

  const cleanupTestIssues = async () => {
    const nearby = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Issue"
      WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${baseLng}, ${baseLat}), 4326)::geography, 200);
    `;
    const ids = nearby.map((r) => r.id);
    if (ids.length > 0) {
      await prisma.report.deleteMany({ where: { issueId: { in: ids } } });
      // ActionLog cannot be deleted due to trigger, but issue status can be set to REJECTED so they are ignored by open issue query
      await prisma.issue.updateMany({
        where: { id: { in: ids } },
        data: { status: "REJECTED" },
      });
    }
  };

  beforeAll(async () => {
    const user = await prisma.user.findFirst({
      where: { email: "citizen@example.com" },
    });
    if (!user) {
      throw new Error("Seeded user citizen@example.com not found. Run seed first.");
    }
    testUserId = user.id;

    await cleanupTestIssues();
  });

  afterAll(async () => {
    await cleanupTestIssues();
  });

  it("creates base issue at reference point", async () => {
    const result = await ingestReportWithSpatialMerge({
      userId: testUserId,
      category: Category.POTHOLES,
      lat: baseLat,
      lng: baseLng,
      address: "Base Test Point",
      photoUrl: "https://placehold.co/600x400.jpg",
      photoSha256: "test_base_sha256",
      signature: "test_sig",
      gpsAccuracyM: 5.0,
      note: "Base pothole report",
      isSeed: true,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.needsDuplicateReview).toBe(false);
    expect(result.report.role).toBe(EvidenceRole.REPORT);
    expect(result.issue.id).toBeDefined();
  });

  it("10 m apart, same category → merges into existing Issue with CONFIRM role", async () => {
    const result = await ingestReportWithSpatialMerge({
      userId: testUserId,
      category: Category.POTHOLES,
      lat: lat10m,
      lng: baseLng,
      address: "10m North of Base",
      photoUrl: "https://placehold.co/600x400.jpg",
      photoSha256: "test_10m_sha256",
      signature: "test_sig",
      gpsAccuracyM: 4.0,
      note: "Second report of same pothole 10m away",
      isSeed: true,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.needsDuplicateReview).toBe(false);
    expect(result.report.role).toBe(EvidenceRole.CONFIRM);
  });

  it("30 m apart, same category → creates new Issue with needsDuplicateReview = true", async () => {
    const result = await ingestReportWithSpatialMerge({
      userId: testUserId,
      category: Category.POTHOLES,
      lat: lat30mSouth,
      lng: baseLng,
      address: "30m South of Base",
      photoUrl: "https://placehold.co/600x400.jpg",
      photoSha256: "test_30m_sha256",
      signature: "test_sig",
      gpsAccuracyM: 6.0,
      note: "Pothole in ambiguity radius 30m away",
      isSeed: true,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.needsDuplicateReview).toBe(true);
    expect(result.report.role).toBe(EvidenceRole.REPORT);
  });

  it("70 m apart, same category → creates independent Issue with needsDuplicateReview = false", async () => {
    const result = await ingestReportWithSpatialMerge({
      userId: testUserId,
      category: Category.POTHOLES,
      lat: baseLat,
      lng: lng70mEast,
      address: "70m East of Base",
      photoUrl: "https://placehold.co/600x400.jpg",
      photoSha256: "test_70m_sha256",
      signature: "test_sig",
      gpsAccuracyM: 5.0,
      note: "Separate pothole 70m away",
      isSeed: true,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.needsDuplicateReview).toBe(false);
    expect(result.report.role).toBe(EvidenceRole.REPORT);
  });

  it("10 m apart, different category → creates new Issue with needsDuplicateReview = true", async () => {
    const result = await ingestReportWithSpatialMerge({
      userId: testUserId,
      category: Category.STREETLIGHTS,
      lat: lat10m,
      lng: baseLng,
      address: "10m North of Base Streetlight",
      photoUrl: "https://placehold.co/600x400.jpg",
      photoSha256: "test_diff_cat_sha256",
      signature: "test_sig",
      gpsAccuracyM: 4.0,
      note: "Streetlight issue very close to pothole",
      isSeed: true,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.needsDuplicateReview).toBe(true);
    expect(result.report.role).toBe(EvidenceRole.REPORT);
  });
});
