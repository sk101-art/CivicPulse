import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { snapPointToSegment, suitsCategory } from "@/lib/db/segments";
import { ingestReportWithSpatialMerge } from "@/lib/issues/merge";
import { Category } from "@prisma/client";

describe("T30 Contract Test: OSM Road Segments & Snapping", () => {
  let testUserId: string;

  // Known coordinate on Outer Ring Road in pilot area (Way 376978813)
  const orrLat = 12.952438;
  const orrLng = 77.700054;

  const cleanupTestIssues = async () => {
    const nearby = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Issue"
      WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${orrLng}, ${orrLat}), 4326)::geography, 200);
    `;
    const ids = nearby.map((r) => r.id);
    if (ids.length > 0) {
      await prisma.report.deleteMany({ where: { issueId: { in: ids } } });
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

  describe("suitsCategory helper", () => {
    it("rejects purely pedestrian classes for vehicular categories", () => {
      expect(suitsCategory("footway", Category.POTHOLES)).toBe(false);
      expect(suitsCategory("pedestrian", Category.POTHOLES)).toBe(false);
      expect(suitsCategory("cycleway", Category.DRAINAGE)).toBe(false);
    });

    it("accepts pedestrian classes for SIDEWALKS and FOOTPATH category", () => {
      expect(suitsCategory("footway", Category.SIDEWALKS)).toBe(true);
      expect(suitsCategory("pedestrian", Category.FOOTPATH)).toBe(true);
    });

    it("accepts standard roads for vehicular and general categories", () => {
      expect(suitsCategory("trunk", Category.POTHOLES)).toBe(true);
      expect(suitsCategory("primary", Category.STREETLIGHTS)).toBe(true);
      expect(suitsCategory("residential", Category.TRASH)).toBe(true);
    });
  });

  describe("snapPointToSegment", () => {
    it("snaps Outer Ring Road coordinate to an arterial road segment within 20m", async () => {
      const snapped = await snapPointToSegment(orrLat, orrLng, Category.POTHOLES, 25);
      expect(snapped).not.toBeNull();
      expect(snapped?.distanceM).toBeLessThanOrEqual(25);
      expect(snapped?.roadClass).toBe("trunk");
      expect(snapped?.name).toBe("Outer Ring Road");
      expect(snapped?.lanes).toBe(3);
    });

    it("returns null for non-pilot coordinates far away", async () => {
      const farLat = 13.3000;
      const farLng = 77.3000;
      const snapped = await snapPointToSegment(farLat, farLng, Category.POTHOLES, 20);
      expect(snapped).toBeNull();
    });
  });

  describe("ingestReportWithSpatialMerge integration", () => {
    it("automatically assigns segmentId to newly created issues within pilot corridor", async () => {
      const result = await ingestReportWithSpatialMerge({
        userId: testUserId,
        category: Category.POTHOLES,
        lat: orrLat,
        lng: orrLng,
        address: "Outer Ring Road Test Corridor",
        photoUrl: "https://placehold.co/600x400.jpg",
        photoSha256: "testsha256osm",
        signature: "test-sig",
        gpsAccuracyM: 5.0,
      });

      expect(result.issue.segmentId).toBeTruthy();

      const issueInDb = await prisma.issue.findUnique({
        where: { id: result.issue.id },
        include: { segment: true },
      });

      expect(issueInDb).not.toBeNull();
      expect(issueInDb?.segmentId).toBeTruthy();
      expect(issueInDb?.segment?.name).toBe("Outer Ring Road");
      expect(issueInDb?.segment?.roadClass).toBe("trunk");
    });
  });
});
