import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeskQueue } from "@/components/desk/DeskQueue";
import { RepairWindowBadge } from "@/components/desk/RepairWindowBadge";
import { GET as getRepairWindow } from "@/app/api/issues/[id]/repair-window/route";
import { GET as getTrafficLive } from "@/app/api/issues/[id]/traffic-live/route";
import * as authModule from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { Role, Status, Band, Category } from "@prisma/client";

describe("Desk Queue EMAXCONN Protection & Zero Repair-Window API Calls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rendering the desk queue cards makes ZERO repair-window API calls", () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const mockIssues = [
      {
        id: "issue-card-1",
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.95,
        lng: 77.70,
        address: "ORR Bellandur",
        priority: 85,
        band: Band.CRITICAL,
        handoffCount: 0,
        slaDueAt: new Date(Date.now() + 86400000).toISOString(),
        slaBreached: false,
        createdAt: new Date().toISOString(),
        bestRepairWindow: {
          start: "2026-10-31T01:00:00+05:30",
          end: "2026-10-31T03:00:00+05:30",
          score: 95,
          reason: "Dry weather, minimal congestion",
          basis: "live" as const,
          display: "Sat 01:00 - 03:00",
          condition: "Low traffic, dry",
          sampleCount: 48,
        },
      },
      {
        id: "issue-card-2",
        category: Category.WATERLOGGING,
        status: Status.IN_PROGRESS,
        lat: 12.96,
        lng: 77.71,
        address: "Marathahalli Bridge",
        priority: 72,
        band: Band.HIGH,
        handoffCount: 1,
        slaDueAt: new Date(Date.now() + 86400000).toISOString(),
        slaBreached: false,
        createdAt: new Date().toISOString(),
        bestRepairWindow: null, // No stored window yet
      },
    ];

    const html = renderToStaticMarkup(
      <DeskQueue
        initialIssues={mockIssues as any}
        agencies={[{ id: "agency-1", code: "BBMP", name: "BBMP Road Infrastructure" }]}
      />
    );

    // Verify rendered output includes stored best window for issue 1
    expect(html).toContain("Sat 01:00 - 03:00");
    expect(html).toContain("data-testid=\"repair-window-card\"");

    // Crucial requirement check: ZERO repair-window fetches made during desk queue render
    const repairWindowCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === "string" && call[0].includes("repair-window")
    );
    expect(repairWindowCalls.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("RepairWindowBadge with variant='card' never fetches from network even without initialResult", () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const html = renderToStaticMarkup(
      <RepairWindowBadge issueId="test-card-issue" variant="card" />
    );

    // Returns null and performs no network request
    expect(html).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("RepairWindow endpoint catches DB errors and returns graceful unavailable (200 OK) instead of 500", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
      error: null,
    });

    // Simulate DB connection failure / EMAXCONN
    vi.spyOn(prisma.issue, "findUnique").mockRejectedValue(
      new Error("connection terminated: max client connections reached, limit: 200")
    );

    const res = await getRepairWindow(
      new Request("http://localhost:3000/api/issues/error-issue/repair-window"),
      { params: Promise.resolve({ id: "error-issue" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unavailable).toBe(true);
    expect(json.displayText).toMatch(/unavailable/i);
    expect(json.bestWindow).toBeNull();
  });

  it("Traffic-live endpoint catches DB errors and returns graceful unavailable (200 OK) instead of 500", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "user-1", email: "user@civicpulse.local", role: Role.CITIZEN },
      error: null,
    });

    // Simulate DB connection failure / EMAXCONN
    vi.spyOn(prisma.issue, "findUnique").mockRejectedValue(
      new Error("connection terminated: max client connections reached, limit: 200")
    );

    const res = await getTrafficLive(
      new Request("http://localhost:3000/api/issues/error-issue/traffic-live"),
      { params: Promise.resolve({ id: "error-issue" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.unavailable).toBe(true);
    expect(json.live.summary).toMatch(/unavailable/i);
  });

  it("RepairWindow endpoint sets Cache-Control: private, max-age=600 and reuses in-memory cache", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
      error: null,
    });

    const repairWindowModule = await import("@/lib/traffic/repairWindow");
    const getSpy = vi.spyOn(repairWindowModule, "getRepairWindowForIssue").mockResolvedValue({
      issueId: "cached-issue",
      basis: "live",
      sampleCount: 12,
      bestWindow: {
        start: "2026-10-31T01:00:00+05:30",
        end: "2026-10-31T03:00:00+05:30",
        display: "Sat 01:00 - 03:00",
        dayOfWeek: "Sat",
        timeRange: "01:00 - 03:00",
        score: 95,
        expectedCongestion: 0.08,
        condition: "Dry, low traffic",
        basis: "live",
        sampleCount: 12,
        factors: { trafficScore: 90, weatherScore: 100, surroundingsScore: 100, crewScore: 90 },
      } as any,
      windows: [],
      allSlots: [],
      displayText: "Sat 01:00 - 03:00",
    });

    // First call: calls getRepairWindowForIssue
    const res1 = await getRepairWindow(
      new Request("http://localhost:3000/api/issues/cached-issue/repair-window"),
      { params: Promise.resolve({ id: "cached-issue" }) }
    );
    expect(res1.status).toBe(200);
    expect(res1.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Second call: served from in-memory cache without recalculation
    const res2 = await getRepairWindow(
      new Request("http://localhost:3000/api/issues/cached-issue/repair-window"),
      { params: Promise.resolve({ id: "cached-issue" }) }
    );
    expect(res2.status).toBe(200);
    expect(res2.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(getSpy).toHaveBeenCalledTimes(1); // Still 1!
  });
});
