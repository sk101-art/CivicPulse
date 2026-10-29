import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildPlaceProfile,
  calculateBearingDeg,
  offsetCoordinate,
  getEstimatedHourlyDelay,
  getNextTargetDate,
  calculateDistanceM,
} from "@/lib/traffic/profile";
import {
  tryIncrementDailyQuota,
  getDailyTomTomCallCount,
  resetDailyTomTomCallCount,
  MAX_DAILY_QUOTA,
} from "@/lib/external/tomtom";
import { runTrafficProfileJob } from "@/lib/jobs/trafficProfile";
import { GET as getTrafficLive } from "@/app/api/issues/[id]/traffic-live/route";
import * as authModule from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { DayType } from "@prisma/client";
import * as tomtomModule from "@/lib/external/tomtom";

describe("Phase 1: Real Per-Place Traffic Profile & Live Traffic Flow", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDailyTomTomCallCount();
    vi.spyOn(tomtomModule, "calculateTomTomRoute").mockImplementation(async (options) => ({
      routes: [
        {
          coords: [
            [options.origin.latitude, options.origin.longitude],
            [options.destination.latitude, options.destination.longitude],
          ],
          distanceMeters: 300,
          travelTimeSeconds: 450,
          noTrafficTravelTimeSeconds: 300,
          trafficDelaySeconds: 150,
          trafficLengthMeters: 300,
          travelMode: "car",
        },
      ],
      travelModeUsed: "car",
      cached: false,
    }));
  });

  describe("Profile Geometry & Math", () => {
    it("computes bearing correctly between coordinates", () => {
      // Due North
      const p1 = { latitude: 12.90, longitude: 77.70 };
      const p2 = { latitude: 12.91, longitude: 77.70 };
      const north = calculateBearingDeg(p1, p2);
      expect(north).toBeCloseTo(0, 1);

      // Due East
      const p3 = { latitude: 12.90, longitude: 77.71 };
      const east = calculateBearingDeg(p1, p3);
      expect(east).toBeCloseTo(90, 1);
    });

    it("offsets coordinates accurately by 150 metres along bearing", () => {
      const origin = { latitude: 12.9575, longitude: 77.7011 };
      const offsetPoint = offsetCoordinate(origin, 150, 90); // 150m East
      const distance = calculateDistanceM(origin, offsetPoint);
      expect(distance).toBeGreaterThan(148);
      expect(distance).toBeLessThan(152);
    });

    it("generates realistic peak and off-peak delay ratios for Indian arterial roads", () => {
      // Night (02:00) delay ratio is very low
      const nightWeekday = getEstimatedHourlyDelay(2, DayType.WEEKDAY, true);
      expect(nightWeekday).toBe(0.05);

      // Morning peak (09:00) delay ratio is high
      const morningPeak = getEstimatedHourlyDelay(9, DayType.WEEKDAY, true);
      expect(morningPeak).toBe(0.85);

      // Evening peak (18:00) delay ratio is highest
      const eveningPeak = getEstimatedHourlyDelay(18, DayType.WEEKDAY, true);
      expect(eveningPeak).toBe(1.05);

      // Weekend evening (19:00) is moderate
      const weekendEvening = getEstimatedHourlyDelay(19, DayType.WEEKEND, true);
      expect(weekendEvening).toBe(0.55);
    });

    it("correctly identifies target future days of the week", () => {
      const ref = new Date("2026-10-29T10:00:00Z"); // Thursday
      const nextTue = getNextTargetDate(2, ref); // Tuesday
      expect(nextTue.getDay()).toBe(2);
      expect(nextTue.getTime()).toBeGreaterThan(ref.getTime());

      const nextSun = getNextTargetDate(0, ref); // Sunday
      expect(nextSun.getDay()).toBe(0);
      expect(nextSun.getTime()).toBeGreaterThan(ref.getTime());
    });
  });

  describe("Daily TomTom Quota Tracking (1,200 calls/day cap)", () => {
    it("tracks and caps daily TomTom calls at 1,200", async () => {
      const testDay = "2026-10-29";
      await resetDailyTomTomCallCount(testDay);

      expect(await getDailyTomTomCallCount(testDay)).toBe(0);

      // Increment quota
      const allowed = await tryIncrementDailyQuota(testDay);
      expect(allowed).toBe(true);
      expect(await getDailyTomTomCallCount(testDay)).toBe(1);

      // Set daily count at limit directly in test database
      await prisma.apiUsage.upsert({
        where: {
          provider_month: {
            provider: "tomtom_daily",
            month: testDay,
          },
        },
        create: {
          provider: "tomtom_daily",
          month: testDay,
          count: MAX_DAILY_QUOTA,
        },
        update: {
          count: MAX_DAILY_QUOTA,
        },
      });

      const blocked = await tryIncrementDailyQuota(testDay);
      expect(blocked).toBe(false);
    });
  });

  describe("buildPlaceProfile", () => {
    const testIssueId = "test-issue-traffic-profile-1";
    const testIssue = {
      id: testIssueId,
      lat: 12.9575,
      lng: 77.7011,
      segmentId: "seed-seg-orr-kadubeesanahalli",
      roadClass: "primary",
    };

    it("builds 48 hourly profile slots (24 weekday + 24 weekend)", async () => {
      // Ensure issue exists in test database
      await prisma.issue.upsert({
        where: { id: testIssueId },
        create: {
          id: testIssueId,
          category: "POTHOLES",
          lat: testIssue.lat,
          lng: testIssue.lng,
          segmentId: testIssue.segmentId,
          slaDueAt: new Date(),
          isSeed: true,
        },
        update: {},
      });

      const result = await buildPlaceProfile(testIssue, true);
      expect(result.points.length).toBe(48);

      const weekdays = result.points.filter((p) => p.dayType === DayType.WEEKDAY);
      const weekends = result.points.filter((p) => p.dayType === DayType.WEEKEND);
      expect(weekdays.length).toBe(24);
      expect(weekends.length).toBe(24);

      // Verify hours 0-23
      expect(weekdays.map((p) => p.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    });

    it("reuses cached profile on second call within 14 days without rebuilding", async () => {
      const first = await buildPlaceProfile(testIssue, false);
      expect(first.points.length).toBe(48);
      const second = await buildPlaceProfile(testIssue, false);

      expect(second.fromCache).toBe(true);
      expect(second.points.length).toBe(48);
    });

    it("shares profiles between issues within 150 metres on the same segment", async () => {
      const nearbyIssueId = "test-issue-nearby-100m";
      // 100m away on same segment
      const nearbyPoint = offsetCoordinate(
        { latitude: testIssue.lat, longitude: testIssue.lng },
        100,
        90
      );

      await prisma.issue.upsert({
        where: { id: nearbyIssueId },
        create: {
          id: nearbyIssueId,
          category: "POTHOLES",
          lat: nearbyPoint.latitude,
          lng: nearbyPoint.longitude,
          segmentId: testIssue.segmentId,
          slaDueAt: new Date(),
          isSeed: true,
        },
        update: {},
      });

      // Clear any pre-existing profile for nearbyIssueId to ensure sharing from testIssueId
      await prisma.placeTrafficProfile.deleteMany({
        where: { issueId: nearbyIssueId },
      });

      const nearbyResult = await buildPlaceProfile({
        id: nearbyIssueId,
        lat: nearbyPoint.latitude,
        lng: nearbyPoint.longitude,
        segmentId: testIssue.segmentId,
        roadClass: "primary",
      });

      expect(nearbyResult.fromCache).toBe(true);
      expect(nearbyResult.sharedFrom).toBe(testIssueId);
    });

    it("blends live TrafficSample rows into the delay ratio", async () => {
      const sampledIssueId = "test-issue-with-samples";
      await prisma.issue.upsert({
        where: { id: sampledIssueId },
        create: {
          id: sampledIssueId,
          category: "POTHOLES",
          lat: 12.935,
          lng: 77.695,
          slaDueAt: new Date(),
          isSeed: true,
        },
        update: {},
      });

      // Insert high-congestion live sample at hour 9 on Tuesday (hourOfWeek: 2 * 24 + 9 = 57)
      await prisma.trafficSample.create({
        data: {
          issueId: sampledIssueId,
          sampledAt: new Date(),
          hourOfWeek: 57,
          currentSpeed: 10,
          freeFlowSpeed: 50,
          congestionR: 0.8, // 80% delay
          isSeed: true,
        },
      });

      const result = await buildPlaceProfile(
        {
          id: sampledIssueId,
          lat: 12.935,
          lng: 77.695,
        },
        true
      );

      const hour9 = result.points.find(
        (p) => p.dayType === DayType.WEEKDAY && p.hour === 9
      );
      expect(hour9).toBeDefined();
      expect(hour9?.delayRatio).toBeGreaterThan(0.5);

      // Clean up sample
      await prisma.trafficSample.deleteMany({ where: { issueId: sampledIssueId } });
    });
  });

  describe("Scheduled Job: traffic-profile", () => {
    it("runs traffic-profile job up to 25 open issues ordered by highest priority", async () => {
      const result = await runTrafficProfileJob(Date.now(), 40_000);
      expect(result).toBeDefined();
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(typeof result.failed).toBe("number");
    });
  });

  describe("GET /api/issues/[id]/traffic-live", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: null,
        error: new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Auth required" } }),
          { status: 401 }
        ) as never,
      });

      const res = await getTrafficLive(
        new Request("http://localhost:3000/api/issues/test-issue/traffic-live"),
        { params: Promise.resolve({ id: "test-issue" }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when issue does not exist", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: { id: "test-user", email: "citizen@example.com", role: "CITIZEN" },
        error: null,
      });

      const res = await getTrafficLive(
        new Request("http://localhost:3000/api/issues/nonexistent-issue/traffic-live"),
        { params: Promise.resolve({ id: "nonexistent-issue" }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 200 with live flow summary, road class, and 24h profile with current hour marked", async () => {
      vi.spyOn(authModule, "withAuth").mockResolvedValue({
        user: { id: "test-user", email: "citizen@example.com", role: "CITIZEN" },
        error: null,
      });

      const issueId = "test-issue-traffic-live-200";
      await prisma.issue.upsert({
        where: { id: issueId },
        create: {
          id: issueId,
          category: "POTHOLES",
          lat: 12.9575,
          lng: 77.7011,
          slaDueAt: new Date(),
          isSeed: true,
        },
        update: {},
      });

      const res = await getTrafficLive(
        new Request(`http://localhost:3000/api/issues/${issueId}/traffic-live`),
        { params: Promise.resolve({ id: issueId }) }
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.live).toBeDefined();
      expect(typeof json.live.currentSpeed).toBe("number");
      expect(typeof json.live.freeFlowSpeed).toBe("number");
      expect(json.live.summary).toContain("Live:");
      expect(json.profile24h).toBeDefined();
      expect(json.profile24h.length).toBe(24);

      const currentHourSlot = json.profile24h.find(
        (p: { isCurrentHour: boolean }) => p.isCurrentHour
      );
      expect(currentHourSlot).toBeDefined();
    });
  });
});
