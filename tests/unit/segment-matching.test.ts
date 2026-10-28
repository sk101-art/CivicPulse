import { describe, it, expect } from "vitest";
import {
  calculateBearing,
  bearingDifference,
  pointToPolylineDistanceM,
  matchSegmentsToRoute,
  matchSegmentsDetailed,
  SegmentCandidate,
} from "@/lib/routing/matchSegments";
import fs from "fs";
import path from "path";

describe("T42 Unit Tests: Segment Matching (PostGIS ST_DWithin + Azimuth)", () => {
  it("computes accurate forward azimuth (bearing) for cardinal directions", () => {
    // North: lat increases
    const north = calculateBearing(12.90, 77.70, 12.91, 77.70);
    expect(Math.round(north)).toBe(0);

    // East: lon increases
    const east = calculateBearing(12.90, 77.70, 12.90, 77.71);
    expect(Math.round(east)).toBe(90);

    // South: lat decreases
    const south = calculateBearing(12.91, 77.70, 12.90, 77.70);
    expect(Math.round(south)).toBe(180);

    // West: lon decreases
    const west = calculateBearing(12.90, 77.71, 12.90, 77.70);
    expect(Math.round(west)).toBe(270);
  });

  it("computes circular bearing difference across the 0/360 wrap-around", () => {
    expect(bearingDifference(10, 350)).toBe(20);
    expect(bearingDifference(355, 15)).toBe(20);
    expect(bearingDifference(45, 60)).toBe(15);
    expect(bearingDifference(180, 0)).toBe(180);
    expect(bearingDifference(90, 270)).toBe(180);
  });

  it("computes accurate distance from point to polyline", () => {
    // Point on the line: distance ~ 0
    const d0 = pointToPolylineDistanceM([12.95, 77.70], [
      [12.94, 77.70],
      [12.96, 77.70],
    ]);
    expect(d0).toBeLessThan(1);

    // Point offset ~21.6 m East
    const d20 = pointToPolylineDistanceM([12.95, 77.7002], [
      [12.94, 77.70],
      [12.96, 77.70],
    ]);
    expect(d20).toBeGreaterThan(15);
    expect(d20).toBeLessThan(25);
  });

  it("Acceptance fixture 1: a route on ORR does not match the parallel service road", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "orr-and-service-road.json"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      route: Array<[number, number]>;
      segments: SegmentCandidate[];
    };

    const matchedIds = await matchSegmentsToRoute(fixture.route, {
      segments: fixture.segments,
      maxDistanceM: 10,
      maxBearingDiffDeg: 30,
    });

    // Must match the main carriageway segments in order
    expect(matchedIds).toEqual(["seg-orr-main-1", "seg-orr-main-2"]);

    // Must NOT match parallel service road (> 10 m away)
    expect(matchedIds).not.toContain("seg-orr-service-road");

    // Must NOT match divergent service road entry (bearing diff > 30°)
    expect(matchedIds).not.toContain("seg-orr-service-divergent");
  });

  it("Acceptance fixture 2: a route under a flyover does not match the flyover", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "flyover-and-underpass.json"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      route: Array<[number, number]>;
      segments: SegmentCandidate[];
    };

    const details = await matchSegmentsDetailed(fixture.route, {
      segments: fixture.segments,
      maxDistanceM: 10,
      maxBearingDiffDeg: 30,
    });

    const matchedIds = await matchSegmentsToRoute(fixture.route, {
      segments: fixture.segments,
      maxDistanceM: 10,
      maxBearingDiffDeg: 30,
    });

    // The surface turn has bearing ~90° (East), while the flyover has bearing ~170° (South)
    // Bearing diff is ~80° (> 30°), so the flyover segment must not match
    expect(matchedIds).toEqual(["seg-underpass-turn"]);
    expect(matchedIds).not.toContain("seg-flyover-straight");

    // Details show the matched step
    expect(details.length).toBeGreaterThan(0);
    expect(details[0].segmentId).toBe("seg-underpass-turn");
    expect(details[0].bearingDiffDeg).toBeLessThan(30);
    expect(details[0].distanceM).toBeLessThan(10);
  });
});
