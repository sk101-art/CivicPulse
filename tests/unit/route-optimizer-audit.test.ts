import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentStatus, Role, Status } from "@prisma/client";
import { GET as getDispatchHistory, POST as postDispatch } from "@/app/api/desk/dispatch/route";
import * as authModule from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";

describe("Page 4 — Route Optimizer & Dispatch Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/desk/dispatch requires AUTHORITY and returns SavedRoute history", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.savedRoute, "findMany").mockResolvedValue([
      {
        id: "route-1",
        userId: "desk-1",
        name: "Ravi Kumar · 2 stops",
        vehicle: "car",
        geomJson: { status: "CONFIRMED_DISPATCH", stopIssueIds: ["iss-1", "iss-2"] },
        createdAt: new Date(),
      },
    ] as never);

    const res = await getDispatchHistory();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.routes).toHaveLength(1);
    expect(data.routes[0].name).toBe("Ravi Kumar · 2 stops");
  });

  it("POST /api/desk/dispatch rejects completed/ineligible issues (VERIFIED_FIXED / CLAIMED_FIXED / REJECTED)", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "p1",
      name: "Ravi Kumar",
      role: "Senior Field Engineer",
      active: true,
    } as never);
    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      { id: "iss-1", status: Status.VERIFIED_FIXED },
    ] as never);

    const res = await postDispatch(
      new Request("http://localhost:3000/api/desk/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: "p1", issueIds: ["iss-1"] }),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error?.code || data.code).toBe("INELIGIBLE_WORK_ORDER");
  });

  it("POST /api/desk/dispatch deduplicates stops, preserves history, creates ordered ActionLogs and SavedRoute", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "p1",
      name: "Ravi Kumar",
      role: "Senior Field Engineer",
      active: true,
    } as never);
    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([
      { id: "iss-1", status: Status.OPEN },
      { id: "iss-2", status: Status.IN_PROGRESS },
    ] as never);

    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const createAssign = vi.fn().mockResolvedValue({ id: "a-new" });
    const updateIssue = vi.fn().mockResolvedValue({ id: "iss-1", status: Status.ASSIGNED });
    const createLog = vi.fn().mockResolvedValue({ id: "log-1" });
    const createRoute = vi.fn().mockResolvedValue({ id: "route-saved-1", name: "Ravi Kumar · 2 stops" });

    vi.spyOn(prisma, "$transaction").mockImplementation(async (fn: any) =>
      fn({
        assignment: { updateMany, create: createAssign },
        issue: { update: updateIssue },
        actionLog: { create: createLog },
        savedRoute: { create: createRoute },
      })
    );

    const res = await postDispatch(
      new Request("http://localhost:3000/api/desk/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnelId: "p1",
          issueIds: ["iss-1", "iss-2", "iss-1"], // duplicate should be deduplicated
          totalDistanceM: 3200,
          totalDurationS: 480,
          routeSource: "TOMTOM_ROAD",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dispatchedCount).toBe(2);
    expect(json.dispatchedIds).toEqual(["iss-1", "iss-2"]);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(createAssign).toHaveBeenCalledTimes(2);
    expect(updateIssue).toHaveBeenCalledTimes(1); // Only OPEN advances to ASSIGNED; IN_PROGRESS stays IN_PROGRESS
    expect(createLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          note: expect.stringContaining("Stop #1 of 2"),
        }),
      })
    );
    expect(createRoute).toHaveBeenCalledTimes(1);
  });
});
