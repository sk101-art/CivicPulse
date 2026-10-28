import { describe, it, expect } from "vitest";
import { matchSegmentsToRoute, matchSegmentsDetailed } from "@/lib/routing/matchSegments";
import { prisma } from "@/lib/db/prisma";

describe("T42 Contract Test: Real PostGIS Segment Matching on OSM RoadSegment Table", () => {
  it("matches real OSM road segments along ORR corridor from the database in travel order", async () => {
    // Route along ORR from Marathahalli towards Kadubeesanahalli
    const orrRoute: Array<[number, number]> = [
      [12.9558, 77.7012],
      [12.9510, 77.7020],
      [12.9440, 77.7005],
      [12.9370, 77.6960],
      [12.9352, 77.6946],
    ];

    const matchedSegmentIds = await matchSegmentsToRoute(orrRoute, {
      maxDistanceM: 20,
      maxBearingDiffDeg: 45,
    });

    expect(Array.isArray(matchedSegmentIds)).toBe(true);
    expect(matchedSegmentIds.length).toBeGreaterThan(0);

    // Verify the returned segment IDs actually exist in the RoadSegment table
    const segmentsInDb = await prisma.roadSegment.findMany({
      where: { id: { in: matchedSegmentIds } },
      select: { id: true, name: true, roadClass: true },
    });

    expect(segmentsInDb.length).toBe(matchedSegmentIds.length);

    // Verify detailed matching contains bearing difference and distances
    const details = await matchSegmentsDetailed(orrRoute, {
      maxDistanceM: 20,
      maxBearingDiffDeg: 45,
    });

    expect(details.length).toBeGreaterThan(0);
    for (const d of details) {
      expect(d.distanceM).toBeLessThanOrEqual(20);
      expect(d.bearingDiffDeg).toBeLessThanOrEqual(45);
    }
  });
});
