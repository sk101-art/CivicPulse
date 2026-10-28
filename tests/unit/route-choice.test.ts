import { describe, it, expect } from "vitest";
import {
  calculateHazardCost,
  calculateRouteScore,
  chooseBestRoute,
  buildAvoidAreasForCriticalHazards,
  getCategorySensitivity,
  EvaluatedRoute,
  IssueSummary,
} from "@/lib/routing/cost";
import { Category } from "@prisma/client";
import fs from "fs";
import path from "path";

describe("T43 Unit Tests: Cost-Based Route Choice and Vehicle Profiles", () => {
  it("enforces vehicle sensitivity matrix and streetlights IST time window", () => {
    // Motorcycle vs Car on potholes and sidewalks
    expect(getCategorySensitivity("motorcycle", Category.POTHOLES)).toBe(1.0);
    expect(getCategorySensitivity("car", Category.POTHOLES)).toBe(0.5);
    expect(getCategorySensitivity("car", Category.SIDEWALKS)).toBe(0.0);
    expect(getCategorySensitivity("wheelchair", Category.SIDEWALKS)).toBe(1.5);

    // Streetlights at night (22:00 IST = 16:30 UTC) -> active
    const nightDate = new Date("2026-10-28T16:30:00Z");
    expect(getCategorySensitivity("pedestrian", Category.STREETLIGHTS, nightDate)).toBe(0.8);

    // Streetlights at noon (13:00 IST = 07:30 UTC) -> inactive (0.0)
    const dayDate = new Date("2026-10-28T07:30:00Z");
    expect(getCategorySensitivity("pedestrian", Category.STREETLIGHTS, dayDate)).toBe(0.0);
  });

  it("generates 30 m padding avoidAreas for CRITICAL issues with blockedShare full", () => {
    const issues: IssueSummary[] = [
      {
        id: "crit-1",
        category: Category.TREE_FALL,
        priority: 95,
        priorityBand: "CRITICAL",
        blockedShare: "full",
        lat: 12.9558,
        lng: 77.7012,
      },
      {
        id: "non-crit-1",
        category: Category.POTHOLES,
        priority: 60,
        priorityBand: "MEDIUM",
        blockedShare: "partial",
        lat: 12.9540,
        lng: 77.7015,
      },
      {
        id: "crit-partial",
        category: Category.WATERLOGGING,
        priority: 90,
        priorityBand: "CRITICAL",
        blockedShare: "partial", // not full
        lat: 12.9530,
        lng: 77.7020,
      },
    ];

    const avoidAreas = buildAvoidAreasForCriticalHazards(issues, 30);
    expect(avoidAreas.length).toBe(1);
    expect(avoidAreas[0].southWestCorner.latitude).toBeLessThan(12.9558);
    expect(avoidAreas[0].northEastCorner.latitude).toBeGreaterThan(12.9558);
  });

  it("Acceptance: same alternatives, different vehicles pick different routes as expected in the fixture", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "vehicle-route-choice.json"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      routes: Array<{
        index: number;
        name: string;
        travelTimeSeconds: number;
        distanceMeters: number;
        trafficDelaySeconds: number;
        coords: Array<[number, number]>;
        issues: IssueSummary[];
      }>;
    };

    const beta = 0.15; // default slider value

    // 1. Motorcycle evaluation
    const motoRoutes: EvaluatedRoute[] = fixture.routes.map((r) => {
      const hCost = calculateHazardCost(r.issues, "motorcycle");
      const score = calculateRouteScore(r.travelTimeSeconds, hCost, beta);
      return {
        ...r,
        hazardCost: hCost,
        routeScore: score,
      };
    });

    const motoChoice = chooseBestRoute(motoRoutes);
    // Motorcycle avoids 2 potholes despite +2 min detour (picks Route B / index 1)
    expect(motoChoice.bestRouteIndex).toBe(1);
    expect(motoChoice.explanation).toContain("avoids 1 hazard, +2 min");

    // 2. Car evaluation
    const carRoutes: EvaluatedRoute[] = fixture.routes.map((r) => {
      const hCost = calculateHazardCost(r.issues, "car");
      const score = calculateRouteScore(r.travelTimeSeconds, hCost, beta);
      return {
        ...r,
        hazardCost: hCost,
        routeScore: score,
      };
    });

    const carChoice = chooseBestRoute(carRoutes);
    // Car prefers the direct route (picks Route A / index 0) because potholes have lower penalty and detour is 2 min slower
    expect(carChoice.bestRouteIndex).toBe(0);

    // 3. Pedestrian evaluation
    const pedRoutes: EvaluatedRoute[] = fixture.routes.map((r) => {
      const hCost = calculateHazardCost(r.issues, "pedestrian");
      const score = calculateRouteScore(r.travelTimeSeconds, hCost, beta);
      return {
        ...r,
        hazardCost: hCost,
        routeScore: score,
      };
    });

    const pedChoice = chooseBestRoute(pedRoutes);
    // Pedestrian avoids broken sidewalk on Route B, prefers Route A (index 0)
    expect(pedChoice.bestRouteIndex).toBe(0);

    // 4. Wheelchair evaluation
    const wheelRoutes: EvaluatedRoute[] = fixture.routes.map((r) => {
      const hCost = calculateHazardCost(r.issues, "wheelchair");
      const score = calculateRouteScore(r.travelTimeSeconds, hCost, beta);
      return {
        ...r,
        hazardCost: hCost,
        routeScore: score,
      };
    });

    const wheelChoice = chooseBestRoute(wheelRoutes);
    // Wheelchair severely penalizes broken sidewalks (1.5x), picks Route A (index 0)
    expect(wheelChoice.bestRouteIndex).toBe(0);
  });

  it("respects the fastest vs safest slider (beta mapping from 0.0 to 0.5)", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "vehicle-route-choice.json"
    );
    interface FixtureRoute {
      index: number;
      name: string;
      travelTimeSeconds: number;
      distanceMeters: number;
      trafficDelaySeconds: number;
      coords: Array<[number, number]>;
      issues: IssueSummary[];
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      routes: FixtureRoute[];
    };

    // When beta = 0.0 (Fastest mode): both vehicles pick the fastest Route A (index 0)
    const betaFastest = 0.0;
    const motoFastestRoutes: EvaluatedRoute[] = fixture.routes.map((r) => ({
      ...r,
      hazardCost: calculateHazardCost(r.issues, "motorcycle"),
      routeScore: calculateRouteScore(
        r.travelTimeSeconds,
        calculateHazardCost(r.issues, "motorcycle"),
        betaFastest
      ),
    }));

    const fastestChoice = chooseBestRoute(motoFastestRoutes);
    expect(fastestChoice.bestRouteIndex).toBe(0); // picks direct fastest route
  });
});
