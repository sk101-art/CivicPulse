import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { POST as assignPersonnelPOST } from "@/app/api/issues/[id]/assign/route";
import { POST as dispatchRoutePOST } from "@/app/api/desk/dispatch/route";
import * as authModule from "@/lib/api/auth";
import { Category, Status, Band, Role, AssignmentStatus } from "@prisma/client";

describe("Field Personnel Assignment & Route Dispatch APIs", () => {
  const createdIssueIds: string[] = [];
  const createdPersonnelIds: string[] = [];
  let authorityUserId: string;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    for (const id of createdIssueIds) {
      await prisma.actionLog.deleteMany({ where: { issueId: id } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { issueId: id } }).catch(() => {});
      await prisma.issue.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdPersonnelIds) {
      await prisma.personnel.delete({ where: { id } }).catch(() => {});
    }
  });

  it("assigns personnel to an issue, creates Assignment + ActionLog, and advances OPEN -> ASSIGNED", async () => {
    const authUser = await prisma.user.findFirst({ where: { role: Role.AUTHORITY } });
    if (!authUser) throw new Error("Seed authority user required");
    authorityUserId = authUser.id;

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: authorityUserId, email: authUser.email, role: Role.AUTHORITY },
      error: null,
    });

    const personnel = await prisma.personnel.create({
      data: {
        name: "Test Field Officer",
        role: "Road Works Supervisor",
        contact: "+91 90000 11111",
        active: true,
      },
    });
    createdPersonnelIds.push(personnel.id);

    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        address: "MG Road Test",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.HIGH,
      },
    });
    createdIssueIds.push(issue.id);

    const req = new Request(`http://localhost/api/issues/${issue.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelId: personnel.id, note: "Urgent dispatch" }),
    });

    const res = await assignPersonnelPOST(req, { params: Promise.resolve({ id: issue.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assignment.personnelId).toBe(personnel.id);
    expect(data.issue.status).toBe(Status.ASSIGNED);

    const dbAssignment = await prisma.assignment.findFirst({
      where: { issueId: issue.id, status: AssignmentStatus.PENDING },
    });
    expect(dbAssignment?.personnelId).toBe(personnel.id);

    const log = await prisma.actionLog.findFirst({
      where: { issueId: issue.id, action: "ASSIGN_PERSONNEL" },
    });
    expect(log?.note).toContain("Test Field Officer");
  });

  it("batch dispatches multiple issues to a personnel via /api/desk/dispatch", async () => {
    const authUser = await prisma.user.findFirst({ where: { role: Role.AUTHORITY } });
    if (!authUser) throw new Error("Seed authority user required");

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: authUser.id, email: authUser.email, role: Role.AUTHORITY },
      error: null,
    });

    const personnel = await prisma.personnel.create({
      data: {
        name: "Batch Dispatch Lead",
        role: "Senior Field Engineer",
        contact: "+91 90000 22222",
        active: true,
      },
    });
    createdPersonnelIds.push(personnel.id);

    const issueA = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.OPEN,
        lat: 12.972,
        lng: 77.595,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.MEDIUM,
      },
    });
    const issueB = await prisma.issue.create({
      data: {
        category: Category.STREETLIGHTS,
        status: Status.CONFIRMED,
        lat: 12.973,
        lng: 77.596,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
      },
    });
    createdIssueIds.push(issueA.id, issueB.id);

    const req = new Request("http://localhost/api/desk/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personnelId: personnel.id,
        issueIds: [issueA.id, issueB.id],
      }),
    });

    const res = await dispatchRoutePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.dispatchedCount).toBe(2);

    const updatedA = await prisma.issue.findUnique({ where: { id: issueA.id } });
    const updatedB = await prisma.issue.findUnique({ where: { id: issueB.id } });
    expect(updatedA?.status).toBe(Status.ASSIGNED);
    expect(updatedB?.status).toBe(Status.ASSIGNED);
  });
});
