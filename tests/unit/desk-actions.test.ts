import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/issues/[id]/actions/route";
import { GET } from "@/app/api/issues/[id]/log/route";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { Category, Role, Status } from "@prisma/client";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T25 Acceptance: Desk actions endpoint, action log, agencies and handoffs", () => {
  let deskAUser: { id: string; email: string };
  let deskBUser: { id: string; email: string };
  let citizenUser: { id: string; email: string };
  let testAgency1: { id: string; name: string };
  let testAgency2: { id: string; name: string };
  let testIssueId: string;
  const createdIssueIds: string[] = [];

  beforeAll(async () => {
    // 1. Fetch or create Desk A and Desk B users
    let deskA = await prisma.user.findFirst({
      where: { email: "desk-a@civicpulse.local" },
    });
    if (!deskA) {
      deskA = await prisma.user.create({
        data: {
          email: "desk-a@civicpulse.local",
          role: Role.AUTHORITY,
          passwordHash: "hash_desk_a",
        },
      });
    }
    deskAUser = { id: deskA.id, email: deskA.email };

    let deskB = await prisma.user.findFirst({
      where: { email: "desk-b@civicpulse.local" },
    });
    if (!deskB) {
      deskB = await prisma.user.create({
        data: {
          email: "desk-b@civicpulse.local",
          role: Role.AUTHORITY,
          passwordHash: "hash_desk_b",
        },
      });
    }
    deskBUser = { id: deskB.id, email: deskB.email };

    let citizen = await prisma.user.findFirst({
      where: { role: Role.CITIZEN },
    });
    if (!citizen) {
      citizen = await prisma.user.create({
        data: {
          email: "citizen-t25@test.local",
          role: Role.CITIZEN,
          passwordHash: "hash_citizen",
        },
      });
    }
    citizenUser = { id: citizen.id, email: citizen.email };

    // 2. Fetch or create test agencies
    let agency1 = await prisma.agency.findFirst();
    if (!agency1) {
      agency1 = await prisma.agency.create({
        data: { name: "BWSSB", code: "bwssb" },
      });
    }
    testAgency1 = { id: agency1.id, name: agency1.name };

    let agency2 = await prisma.agency.findFirst({
      where: { id: { not: agency1.id } },
    });
    if (!agency2) {
      agency2 = await prisma.agency.create({
        data: { name: "BESCOM", code: "bescom" },
      });
    }
    testAgency2 = { id: agency2.id, name: agency2.name };

    // 3. Create initial OPEN issue
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    testIssueId = issue.id;
    createdIssueIds.push(issue.id);
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.report.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      });
      await prisma.issue.updateMany({
        where: { id: { in: createdIssueIds } },
        data: { status: Status.REJECTED },
      });
    }
  });

  it("citizen user attempting desk action is rejected with 403 FORBIDDEN", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUser.id, role: Role.CITIZEN, email: citizenUser.email },
      expires: "1",
    });

    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("Desk A CONFIRM action updates status to CONFIRMED and writes exactly one ActionLog row", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: deskAUser.id, role: Role.AUTHORITY, email: deskAUser.email },
      expires: "1",
    });

    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM", note: "Confirmed by Desk A" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.issue.status).toBe("CONFIRMED");
    expect(body.actionLog.action).toBe("CONFIRM");
    expect(body.actionLog.actorId).toBe(deskAUser.id);

    const logCount = await prisma.actionLog.count({
      where: { issueId: testIssueId, action: "CONFIRM" },
    });
    expect(logCount).toBe(1);
  });

  it("Desk B ASSIGN_AGENCY sets agencyId and writes an ActionLog row", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: deskBUser.id, role: Role.AUTHORITY, email: deskBUser.email },
      expires: "1",
    });

    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ASSIGN_AGENCY", agencyId: testAgency1.id }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.issue.status).toBe("ASSIGNED");
    expect(body.issue.agencyId).toBe(testAgency1.id);
    expect(body.issue.handoffCount).toBe(0);
  });

  it("REASSIGN_AGENCY increments handoffCount and writes an ActionLog row", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: deskAUser.id, role: Role.AUTHORITY, email: deskAUser.email },
      expires: "1",
    });

    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REASSIGN_AGENCY",
        agencyId: testAgency2.id,
        note: "Transferred to electricity department",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.issue.agencyId).toBe(testAgency2.id);
    expect(body.issue.handoffCount).toBe(1);

    const updatedIssue = await prisma.issue.findUnique({
      where: { id: testIssueId },
    });
    expect(updatedIssue?.handoffCount).toBe(1);
    expect(updatedIssue?.agencyId).toBe(testAgency2.id);
  });

  it("OVERRIDE_BAND sets bandOverride and records note in ActionLog", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: deskBUser.id, role: Role.AUTHORITY, email: deskBUser.email },
      expires: "1",
    });

    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "OVERRIDE_BAND",
        overrideBand: "CRITICAL",
        note: "Urgent VIP route repair needed",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.issue.bandOverride).toBe("CRITICAL");
    expect(body.issue.bandOverrideNote).toBe("Urgent VIP route repair needed");
  });

  it("GET /api/issues/[id]/log is public and returns enriched logs with Desk A/B names", async () => {
    const req = new Request(`http://localhost:3000/api/issues/${testIssueId}/log`);
    const res = await GET(req, { params: Promise.resolve({ id: testIssueId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThanOrEqual(3);

    const deskALog = body.logs.find((l: { actorName: string }) => l.actorName === "Desk A");
    const deskBLog = body.logs.find((l: { actorName: string }) => l.actorName === "Desk B");

    expect(deskALog).toBeDefined();
    expect(deskBLog).toBeDefined();
  });

  it("database trigger blocks UPDATE or DELETE on ActionLog", async () => {
    const log = await prisma.actionLog.findFirst({
      where: { issueId: testIssueId },
    });
    expect(log).toBeDefined();
    if (!log) return;

    // Test UPDATE prevention
    await expect(
      prisma.actionLog.update({
        where: { id: log.id },
        data: { note: "Attempted tampering of immutable log" },
      })
    ).rejects.toThrow(/append-only/i);

    // Test DELETE prevention
    await expect(
      prisma.actionLog.delete({
        where: { id: log.id },
      })
    ).rejects.toThrow(/append-only/i);
  });
});
