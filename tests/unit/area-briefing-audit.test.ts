import { describe, it, expect, vi, beforeEach } from "vitest";
import { Band, Category, Role, Status } from "@prisma/client";
import { GET as getBrief } from "@/app/api/desk/analyst/brief/route";
import { POST as postChat } from "@/app/api/desk/analyst/chat/route";
import { loadAreaBriefingTelemetry } from "@/lib/desk/areaBriefing";
import * as authModule from "@/lib/api/auth";
import * as analystModule from "@/lib/ai/analyst";
import { prisma } from "@/lib/db/prisma";

describe("Page 6 — Area Briefing Data Integrity, AI Grounding & Authorization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/desk/analyst/brief and POST /api/desk/analyst/chat enforce AUTHORITY role", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    });

    const resBrief = await getBrief(new Request("http://localhost:3000/api/desk/analyst/brief"));
    expect(resBrief.status).toBe(403);

    const resChat = await postChat(
      new Request("http://localhost:3000/api/desk/analyst/chat", {
        method: "POST",
        body: JSON.stringify({ query: "Which ward has most potholes?" }),
      })
    );
    expect(resChat.status).toBe(403);
  });

  it("loadAreaBriefingTelemetry computes accurate KPIs, excludes closed from active, and marks dispatch as suggestions", async () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 4 * 3600 * 1000);
    const past = new Date(now.getTime() - 48 * 3600 * 1000);

    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      {
        id: "iss-1",
        category: Category.POTHOLES,
        status: Status.OPEN,
        band: Band.CRITICAL,
        bandOverride: null,
        priority: 90,
        lat: 12.93,
        lng: 77.67,
        address: "Bellandur Gate",
        wardId: "w1",
        agencyId: null,
        slaDueAt: past,
        slaBreached: true,
        isHotspot: true,
        createdAt: past,
        agency: null,
        assignments: [],
      },
      {
        id: "iss-2",
        category: Category.DRAINAGE,
        status: Status.IN_PROGRESS,
        band: Band.HIGH,
        bandOverride: null,
        priority: 75,
        lat: 12.931,
        lng: 77.671,
        address: "Bellandur Lake Rd",
        wardId: "w1",
        agencyId: "ag-1",
        slaDueAt: soon,
        slaBreached: false,
        isHotspot: false,
        createdAt: now,
        agency: { id: "ag-1", name: "BBMP" },
        assignments: [{ id: "a1" }],
      },
      {
        id: "iss-3",
        category: Category.STREETLIGHTS,
        status: Status.VERIFIED_FIXED,
        band: Band.CRITICAL,
        bandOverride: null,
        priority: 85,
        lat: 12.932,
        lng: 77.672,
        address: "ORR",
        wardId: "w1",
        agencyId: "ag-1",
        slaDueAt: past,
        slaBreached: true,
        isHotspot: false,
        createdAt: past,
        agency: { id: "ag-1", name: "BBMP" },
        assignments: [{ id: "a2" }],
      },
    ] as never);

    vi.spyOn(prisma.ward, "findMany").mockResolvedValue([
      { id: "w1", code: "47", name: "Bellanduru", wardNumber: 47 },
    ] as never);
    vi.spyOn(prisma.agency, "findMany").mockResolvedValue([
      { id: "ag-1", code: "BBMP", name: "BBMP" },
    ] as never);
    vi.spyOn(prisma.issue, "count")
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);

    const telemetry = await loadAreaBriefingTelemetry({ wardCode: "ALL", period: "30d" });

    expect(telemetry.kpis).toEqual({
      totalActiveIssues: 2,
      highCriticalPriority: 2,
      awaitingAssignment: 1,
      slaAtRisk: 1,
      slaBreached: 1,
      recentlyResolved: 1,
    });
    expect(telemetry.dispatchSuggestions.length).toBeGreaterThan(0);
    expect(telemetry.dispatchSuggestions.every((s) => s.isSuggestion === true)).toBe(true);
  });

  it("POST /api/desk/analyst/chat normalizes zone-all / ALL wardId to undefined", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@local", role: Role.AUTHORITY },
      error: null,
    });
    const askSpy = vi.spyOn(analystModule, "askDeskAnalyst").mockResolvedValue({
      answer: "Bellanduru has 2 active potholes.",
      engine: "Rules Engine",
    } as never);

    const res = await postChat(
      new Request("http://localhost:3000/api/desk/analyst/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Which ward has most potholes?", wardId: "zone-all" }),
      })
    );
    expect(res.status).toBe(200);
    expect(askSpy).toHaveBeenCalledWith("Which ward has most potholes?", { wardId: undefined });
  });
});
