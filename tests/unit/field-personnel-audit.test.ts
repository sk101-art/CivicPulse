import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentStatus, Role, Status } from "@prisma/client";
import { GET as getPersonnels, POST as postPersonnel } from "@/app/api/personnels/route";
import {
  GET as getPersonnelById,
  PATCH as patchPersonnel,
  DELETE as deletePersonnel,
} from "@/app/api/personnels/[id]/route";
import { POST as postAssign } from "@/app/api/issues/[id]/assign/route";
import { POST as postDispatch } from "@/app/api/desk/dispatch/route";
import { enrichPersonnelRecord } from "@/lib/desk/personnelData";
import { getServerSession } from "next-auth/next";
import * as authModule from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("Page 2 — Field Personnel Complete Functional & Integration Audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthorized / citizen requests to personnel APIs", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "cit-1", role: "CITIZEN", email: "citizen@local" },
    } as never);

    const resGet = await getPersonnels(new Request("http://localhost:3000/api/personnels"));
    expect(resGet.status).toBe(401);

    const resPost = await postPersonnel(
      new Request("http://localhost:3000/api/personnels", {
        method: "POST",
        body: JSON.stringify({ name: "Hacker", role: "Field Officer", contact: "+91 99999 00000" }),
      })
    );
    expect(resPost.status).toBe(401);

    const resPatch = await patchPersonnel(
      new Request("http://localhost:3000/api/personnels/p1", {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(resPatch.status).toBe(401);
  });

  it("enriches personnel workload with distinct issue counts and derives Active / On Duty / Inactive", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 48 * 3600 * 1000);

    const onDuty = enrichPersonnelRecord({
      id: "p1",
      name: "Ravi Kumar",
      role: "Senior Field Engineer",
      contact: "+91 98765 43021",
      active: true,
      createdAt: past,
      updatedAt: now,
      assignments: [
        {
          id: "a1",
          issueId: "iss-1",
          status: AssignmentStatus.PENDING,
          createdAt: now,
          completedAt: null,
          issue: {
            id: "iss-1",
            category: "POTHOLES",
            address: "ORR",
            status: Status.ASSIGNED,
            priority: 80,
            band: "HIGH",
            bandOverride: null,
            slaDueAt: past,
            slaBreached: true,
          },
        },
        // Duplicate assignment row for same issue should not double-count activeCount
        {
          id: "a2",
          issueId: "iss-1",
          status: AssignmentStatus.IN_PROGRESS,
          createdAt: now,
          completedAt: null,
          issue: {
            id: "iss-1",
            category: "POTHOLES",
            address: "ORR",
            status: Status.IN_PROGRESS,
            priority: 80,
            band: "HIGH",
            bandOverride: null,
            slaDueAt: past,
            slaBreached: true,
          },
        },
        {
          id: "a3",
          issueId: "iss-2",
          status: AssignmentStatus.COMPLETED,
          createdAt: past,
          completedAt: now,
          issue: {
            id: "iss-2",
            category: "DRAINAGE",
            address: "Indiranagar",
            status: Status.VERIFIED_FIXED,
            priority: 60,
            band: "MEDIUM",
            bandOverride: null,
            slaDueAt: now,
            slaBreached: false,
          },
        },
      ],
    });

    expect(onDuty.dutyStatus).toBe("On Duty");
    expect(onDuty.workload).toEqual({
      activeCount: 1,
      pendingCount: 1,
      inProgressCount: 0,
      completedCount: 1,
      overdueCount: 1,
    });
    expect(onDuty.activeAssignments).toHaveLength(1);
    expect(onDuty.historicalAssignments).toHaveLength(1);

    const available = enrichPersonnelRecord({
      ...onDuty,
      createdAt: past,
      updatedAt: now,
      assignments: [],
    });
    expect(available.dutyStatus).toBe("Active");

    const inactive = enrichPersonnelRecord({
      ...onDuty,
      active: false,
      createdAt: past,
      updatedAt: now,
      assignments: [],
    });
    expect(inactive.dutyStatus).toBe("Inactive");
  });

  it("rejects duplicate personnel creation by contact or name+role", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "desk-1", role: "AUTHORITY", email: "desk-a@civicpulse.local" },
    } as never);

    vi.spyOn(prisma.personnel, "findMany").mockResolvedValue([
      { id: "p-existing", name: "Ravi Kumar", role: "Senior Field Engineer", contact: "+91 98765 43021" },
    ] as never);

    const res = await postPersonnel(
      new Request("http://localhost:3000/api/personnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ravi Kumar",
          role: "Senior Field Engineer",
          contact: "+91 98765 43021",
        }),
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates, retrieves, updates, and preserves history on deactivation", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "desk-1", role: "AUTHORITY", email: "desk-a@civicpulse.local" },
    } as never);

    const now = new Date();
    vi.spyOn(prisma.personnel, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma, "$transaction").mockImplementation(async (fn: any) =>
      fn({
        personnel: {
          create: vi.fn().mockResolvedValue({
            id: "p-new",
            name: "Kiran Rao",
            role: "Drainage Technician",
            contact: "+91 98000 11223",
            active: true,
            createdAt: now,
            updatedAt: now,
            assignments: [],
          }),
          update: vi.fn().mockResolvedValue({
            id: "p-new",
            name: "Kiran Rao",
            role: "Senior Field Engineer",
            contact: "+91 98000 11223",
            active: false,
            createdAt: now,
            updatedAt: now,
            assignments: [],
          }),
        },
        adminAudit: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      })
    );

    const resCreate = await postPersonnel(
      new Request("http://localhost:3000/api/personnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Kiran Rao",
          role: "Drainage Technician",
          contact: "+91 98000 11223",
        }),
      })
    );
    expect(resCreate.status).toBe(201);
    const created = await resCreate.json();
    expect(created.dutyStatus).toBe("Active");

    // GET by id
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "p-new",
      name: "Kiran Rao",
      role: "Drainage Technician",
      contact: "+91 98000 11223",
      active: true,
      createdAt: now,
      updatedAt: now,
      assignments: [],
    } as never);
    const resGet = await getPersonnelById(new Request("http://localhost:3000/api/personnels/p-new"), {
      params: Promise.resolve({ id: "p-new" }),
    });
    expect(resGet.status).toBe(200);

    // PATCH update
    const resPatch = await patchPersonnel(
      new Request("http://localhost:3000/api/personnels/p-new", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "Senior Field Engineer", active: false }),
      }),
      { params: Promise.resolve({ id: "p-new" }) }
    );
    expect(resPatch.status).toBe(200);
    const patched = await resPatch.json();
    expect(patched.dutyStatus).toBe("Inactive");

    // DELETE with historical assignments -> soft-deactivate
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "p-new",
      name: "Kiran Rao",
      role: "Senior Field Engineer",
      _count: { assignments: 2 },
    } as never);
    const resDel = await deletePersonnel(new Request("http://localhost:3000/api/personnels/p-new"), {
      params: Promise.resolve({ id: "p-new" }),
    });
    expect(resDel.status).toBe(200);
    const delJson = await resDel.json();
    expect(delJson.deactivated).toBe(true);
  });

  it("prevents assigning or route-dispatching inactive personnel", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue({
      id: "iss-1",
      status: Status.OPEN,
    } as never);
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "p-inactive",
      name: "Inactive Officer",
      role: "Field Officer",
      active: false,
    } as never);

    const resAssign = await postAssign(
      new Request("http://localhost:3000/api/issues/iss-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: "p-inactive" }),
      }),
      { params: Promise.resolve({ id: "iss-1" }) }
    );
    expect(resAssign.status).toBe(400);

    const resDispatch = await postDispatch(
      new Request("http://localhost:3000/api/desk/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: "p-inactive", issueIds: ["iss-1"] }),
      })
    );
    expect(resDispatch.status).toBe(400);
  });
});
