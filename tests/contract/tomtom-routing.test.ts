import { describe, it, expect, beforeEach, vi } from "vitest";

// Safe routing requires a signed-in user (protects the free TomTom quota).
vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "test-routing-user", email: "routing@example.com", role: "CITIZEN" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  }),
}));
import {
  calculateTomTomRoute,
  parseTomTomRouteResponse,
  isLocationInIndia,
  clearTomTomRouteCache,
  resetMonthlyTomTomCallCount,
} from "@/lib/external/tomtom";
import { POST as safeRoutePOST, GET as safeRouteGET } from "@/app/api/routes/safe/route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

describe("T41 Contract Test: TomTom Routing Adapter & Safe Routes API", () => {
  beforeEach(async () => {
    clearTomTomRouteCache();
    await resetMonthlyTomTomCallCount();
  });

  it("verifies synthetic TomTom fixture exists and conforms to official schema with _synthetic: true", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "synthetic-tomtom-route.json"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    expect(fixture._synthetic).toBe(true);
    expect(fixture.formatVersion).toBe("0.0.12");
    expect(Array.isArray(fixture.routes)).toBe(true);
    expect(fixture.routes.length).toBeGreaterThanOrEqual(1);

    const routes = parseTomTomRouteResponse(fixture, "car");
    expect(routes.length).toBe(2);
    expect(routes[0].coords.length).toBeGreaterThan(2);
    expect(routes[0].distanceMeters).toBe(4320);
    expect(routes[0].travelTimeSeconds).toBe(540);
    expect(routes[0].trafficDelaySeconds).toBe(60);
    expect(routes[0].travelMode).toBe("car");
  });

  it("strictly validates geographic bounding box for India (APP_REGION=IN)", () => {
    // Valid points in Bengaluru and Mumbai
    expect(isLocationInIndia({ latitude: 12.9558, longitude: 77.7012 })).toBe(true);
    expect(isLocationInIndia({ latitude: 19.076, longitude: 72.8777 })).toBe(true);

    // Points outside India
    expect(isLocationInIndia({ latitude: 51.5074, longitude: -0.1278 })).toBe(false); // London
    expect(isLocationInIndia({ latitude: 40.7128, longitude: -74.006 })).toBe(false); // New York
    expect(isLocationInIndia({ latitude: 1.3521, longitude: 103.8198 })).toBe(false); // Singapore
  });

  it("rejects routing requests with coordinates outside India with clear error", async () => {
    await expect(
      calculateTomTomRoute({
        origin: { latitude: 51.5074, longitude: -0.1278 }, // London
        destination: { latitude: 12.9558, longitude: 77.7012 },
      })
    ).rejects.toThrow(/outside India/i);
  });

  it("returns synthetic routes in keys-later mode when TOMTOM_API_KEY is not set", async () => {
    const envModule = await import("@/lib/env");
    const isConfiguredSpy = vi.spyOn(envModule, "isConfigured").mockImplementation((key) => {
      if (key === "TOMTOM_API_KEY") return false;
      return envModule.isConfigured(key);
    });

    try {
      const result = await calculateTomTomRoute({
        origin: { latitude: 12.9558, longitude: 77.7012 }, // Marathahalli
        destination: { latitude: 12.9352, longitude: 77.6946 }, // Kadubeesanahalli
        travelMode: "motorcycle",
      });

      expect(result.disabled).toBe(true);
      expect(result._synthetic).toBe(true);
      expect(result.fallbackNote).toContain("TomTom routing disabled – key not set");
      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0].coords.length).toBeGreaterThan(1);
      expect(result.routes[0].distanceMeters).toBeGreaterThan(0);
    } finally {
      isConfiguredSpy.mockRestore();
    }
  });

  it("caches identical routing requests within the 5-minute TTL", async () => {
    const reqOptions = {
      origin: { latitude: 12.9558, longitude: 77.7012 },
      destination: { latitude: 12.9352, longitude: 77.6946 },
      travelMode: "car" as const,
      maxAlternatives: 2,
    };

    const first = await calculateTomTomRoute(reqOptions);
    expect(first.cached).toBe(false);

    const second = await calculateTomTomRoute(reqOptions);
    expect(second.cached).toBe(true);
    expect(second.routes.length).toBe(first.routes.length);
  });

  it("POST /api/routes/safe returns valid JSON route alternatives and handles invalid inputs", async () => {
    // Valid request along ORR pilot corridor
    const validReq = new NextRequest("http://localhost:3000/api/routes/safe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { latitude: 12.9558, longitude: 77.7012 },
        destination: { latitude: 12.9352, longitude: 77.6946 },
        travelMode: "car",
        maxAlternatives: 2,
      }),
    });

    const res = await safeRoutePOST(validReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThanOrEqual(1);
    expect(body.routes[0].coords.length).toBeGreaterThan(1);
    expect(body.routes[0].distance).toBeGreaterThan(0);

    // Coordinate outside India -> 400 Bad Request
    const invalidReq = new NextRequest("http://localhost:3000/api/routes/safe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { latitude: 48.8566, longitude: 2.3522 }, // Paris
        destination: { latitude: 12.9352, longitude: 77.6946 },
      }),
    });

    const invalidRes = await safeRoutePOST(invalidReq);
    expect(invalidRes.status).toBe(400);
    const errBody = await invalidRes.json();
    expect(errBody.error).toMatch(/outside India/i);
  });

  it("GET /api/routes/safe handles query parameters cleanly", async () => {
    const getReq = new NextRequest(
      "http://localhost:3000/api/routes/safe?origin=12.9558,77.7012&destination=12.9352,77.6946&travelMode=car"
    );
    const res = await safeRouteGET(getReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);
  });

  it("verifies project-osrm is completely removed from all source code", () => {
    const srcDir = path.join(process.cwd(), "src");
    function walkDir(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          walkDir(fullPath, fileList);
        } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const allSourceFiles = walkDir(srcDir);
    for (const filePath of allSourceFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("project-osrm");
    }
  });
});
