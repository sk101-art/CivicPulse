import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getRepairWindow } from "@/app/api/issues/[id]/repair-window/route";
import {
  getFlowSegment,
  clearTomTomFlowCache,
  resetMonthlyTomTomCallCount,
} from "@/lib/external/tomtom";
import { Role } from "@prisma/client";
import * as authModule from "@/lib/api/auth";
import * as repairWindowModule from "@/lib/traffic/repairWindow";
import * as envModule from "@/lib/env";

describe("Repair Window Endpoint (Desk Only) & TomTom Flow Null-Safety", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTomTomFlowCache();
    resetMonthlyTomTomCallCount();
  });

  describe("GET /api/issues/[id]/repair-window (desk only)", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: null,
        error: new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Auth required" } }),
          { status: 401 }
        ) as never,
      });

      const res = await getRepairWindow(
        new Request("http://localhost:3000/api/issues/issue-123/repair-window"),
        { params: Promise.resolve({ id: "issue-123" }) }
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 if authenticated user is CITIZEN (desk only)", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: null,
        error: new Response(
          JSON.stringify({ error: { code: "FORBIDDEN", message: "Requires AUTHORITY" } }),
          { status: 403 }
        ) as never,
      });

      const res = await getRepairWindow(
        new Request("http://localhost:3000/api/issues/issue-123/repair-window"),
        { params: Promise.resolve({ id: "issue-123" }) }
      );

      expect(res.status).toBe(403);
    });

    it("returns 404 if issue does not exist", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: { id: "desk-user-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
        error: null,
      });
      vi.spyOn(repairWindowModule, "getRepairWindowForIssue").mockResolvedValue(null);

      const res = await getRepairWindow(
        new Request("http://localhost:3000/api/issues/missing-id/repair-window"),
        { params: Promise.resolve({ id: "missing-id" }) }
      );

      expect(res.status).toBe(404);
    });

    it("returns 200 with repair window results when authenticated as AUTHORITY", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: { id: "desk-user-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
        error: null,
      });

      const mockResult: repairWindowModule.RepairWindowResult = {
        issueId: "issue-123",
        basis: "live",
        sampleCount: 8,
        bestWindow: {
          start: "2026-10-30T01:00:00.000Z",
          end: "2026-10-30T03:00:00.000Z",
          display: "Fri 01:00-03:00",
          dayOfWeek: "Fri",
          timeRange: "01:00-03:00",
          expectedCongestion: 0.08,
          condition: "low traffic, dry",
          basis: "live",
          sampleCount: 8,
        },
        windows: [],
        displayText: "Best repair window: Fri 01:00-03:00 (low traffic, dry) · based on 8 samples · live",
      };

      vi.spyOn(repairWindowModule, "getRepairWindowForIssue").mockResolvedValue(mockResult);

      const res = await getRepairWindow(
        new Request("http://localhost:3000/api/issues/issue-123/repair-window"),
        { params: Promise.resolve({ id: "issue-123" }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.issueId).toBe("issue-123");
      expect(json.basis).toBe("live");
      expect(json.bestWindow.display).toBe("Fri 01:00-03:00");
    });
  });

  describe("getFlowSegment (null-safety & caching)", () => {
    it("returns null safely when TOMTOM_API_KEY is not configured (never throws)", async () => {
      vi.spyOn(envModule, "isConfigured").mockImplementation((key) =>
        key === "TOMTOM_API_KEY" ? false : true
      );

      const result = await getFlowSegment(12.9558, 77.7012);
      expect(result).toBeNull();
    });

    it("returns null safely when coordinates are outside India (never throws)", async () => {
      vi.spyOn(envModule, "isConfigured").mockReturnValue(true);

      // Coordinates for London, UK (51.5074° N, 0.1278° W)
      const result = await getFlowSegment(51.5074, -0.1278);
      expect(result).toBeNull();
    });

    it("parses valid TomTom flowSegmentData response and caches for 15 minutes", async () => {
      vi.spyOn(envModule, "isConfigured").mockReturnValue(true);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            flowSegmentData: {
              frc: "FRC1",
              currentSpeed: 38,
              freeFlowSpeed: 50,
              confidence: 0.92,
            },
          }),
          { status: 200 }
        )
      );

      const lat = 12.9558;
      const lng = 77.7012;

      // First call -> hits fetch
      const result1 = await getFlowSegment(lat, lng);
      expect(result1).not.toBeNull();
      expect(result1?.currentSpeed).toBe(38);
      expect(result1?.freeFlowSpeed).toBe(50);
      expect(result1?.frc).toBe("FRC1");
      expect(result1?.confidence).toBe(0.92);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call immediately -> hits 15-minute cache
      const result2 = await getFlowSegment(lat, lng);
      expect(result2).toEqual(result1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns null safely on network failure or HTTP error", async () => {
      vi.spyOn(envModule, "isConfigured").mockReturnValue(true);
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network timeout"));

      const result = await getFlowSegment(12.9558, 77.7012);
      expect(result).toBeNull();
    });
  });
});
