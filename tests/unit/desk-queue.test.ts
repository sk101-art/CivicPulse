import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { GET as getQueue } from "@/app/api/desk/queue/route";
import { POST as postAction } from "@/app/api/issues/[id]/actions/route";
import { GET as getLog } from "@/app/api/issues/[id]/log/route";
import { getAllowedActions } from "@/lib/issues/stateMachine";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { Category, Role, Status, Band } from "@prisma/client";
import type { Session } from "next-auth";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

interface QueueIssue {
  id: string;
  slaBreached: boolean;
  category: string;
  band: Band;
  priority: number;
}

interface ActionLogItem {
  id: string;
  actorName: string;
  action: string;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdAt: string;
}

describe("T26 Acceptance: Shared desk dashboard & queue", () => {
  let deskAUser: { id: string; email: string };
  let deskBUser: { id: string; email: string };
  let citizenUser: { id: string; email: string };
  let testAgency: { id: string; code: string; name: string };
  const createdIssueIds: string[] = [];

  const createMockSession = (user: { id: string; email: string; role: Role }): Session => ({
    user: { id: user.id, role: user.role, email: user.email },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

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
          email: "citizen-t26@test.local",
          role: Role.CITIZEN,
          passwordHash: "hash_citizen",
        },
      });
    }
    citizenUser = { id: citizen.id, email: citizen.email };

    let agency = await prisma.agency.findFirst({
      where: { code: "bbmp-roads" },
    });
    if (!agency) {
      agency = await prisma.agency.findFirst();
      if (!agency) {
        agency = await prisma.agency.create({
          data: { code: "bbmp-roads", name: "BBMP Major Roads" },
        });
      }
    }
    testAgency = { id: agency.id, code: agency.code, name: agency.name };
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.actionLog.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
      await prisma.report.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
      await prisma.issue.deleteMany({
        where: { id: { in: createdIssueIds } },
      }).catch(() => {});
    }
  });

  it("rejects non-authority users attempting to access /api/desk/queue", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(
      createMockSession({ id: citizenUser.id, email: citizenUser.email, role: Role.CITIZEN })
    );

    const req = new Request("http://localhost:3000/api/desk/queue");
    const res = await getQueue(req);
    expect(res.status).toBe(403);
  });

  it("orders issues strictly by PI Band (CRITICAL > HIGH > MEDIUM > LOW) then Priority desc", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      createMockSession({ id: deskAUser.id, email: deskAUser.email, role: Role.AUTHORITY })
    );

    // Create 4 test issues with different bands
    const lowIssue = await prisma.issue.create({
      data: {
        category: Category.TRASH,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.LOW,
        priority: 25.0,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    const medIssue = await prisma.issue.create({
      data: {
        category: Category.STREETLIGHTS,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.MEDIUM,
        priority: 45.0,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    const highIssue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.HIGH,
        priority: 65.0,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    const critIssue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.CRITICAL,
        priority: 85.0,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });

    createdIssueIds.push(lowIssue.id, medIssue.id, highIssue.id, critIssue.id);

    const req = new Request("http://localhost:3000/api/desk/queue");
    const res = await getQueue(req);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { issues: QueueIssue[] };
    const fetchedIds = data.issues.map((i) => i.id);

    const critIndex = fetchedIds.indexOf(critIssue.id);
    const highIndex = fetchedIds.indexOf(highIssue.id);
    const medIndex = fetchedIds.indexOf(medIssue.id);
    const lowIndex = fetchedIds.indexOf(lowIssue.id);

    expect(critIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeGreaterThan(critIndex);
    expect(medIndex).toBeGreaterThan(highIndex);
    expect(lowIndex).toBeGreaterThan(medIndex);
  });

  it("filters the queue by status, category, agency, and SLA breach", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      createMockSession({ id: deskBUser.id, email: deskBUser.email, role: Role.AUTHORITY })
    );

    const breachedIssue = await prisma.issue.create({
      data: {
        category: Category.TREE_FALL,
        status: Status.ASSIGNED,
        agencyId: testAgency.id,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.HIGH,
        priority: 60.0,
        slaDueAt: new Date(Date.now() - 3600 * 1000),
        slaBreached: true,
      },
    });
    createdIssueIds.push(breachedIssue.id);

    // Filter by slaBreached=true
    const req1 = new Request("http://localhost:3000/api/desk/queue?slaBreached=true");
    const res1 = await getQueue(req1);
    const data1 = (await res1.json()) as { issues: QueueIssue[] };
    expect(data1.issues.some((i) => i.id === breachedIssue.id)).toBe(true);
    expect(data1.issues.every((i) => i.slaBreached === true)).toBe(true);

    // Filter by category=TREE_FALL
    const req2 = new Request("http://localhost:3000/api/desk/queue?category=TREE_FALL");
    const res2 = await getQueue(req2);
    const data2 = (await res2.json()) as { issues: QueueIssue[] };
    expect(data2.issues.some((i) => i.id === breachedIssue.id)).toBe(true);
    expect(data2.issues.every((i) => i.category === "TREE_FALL")).toBe(true);

    // Filter by agencyId
    const req3 = new Request(`http://localhost:3000/api/desk/queue?agencyId=${testAgency.id}`);
    const res3 = await getQueue(req3);
    const data3 = (await res3.json()) as { issues: QueueIssue[] };
    expect(data3.issues.some((i) => i.id === breachedIssue.id)).toBe(true);
  });

  it("getAllowedActions returns exact allowed actions according to the state machine", () => {
    const openActions = getAllowedActions(Status.OPEN, "AUTHORITY");
    expect(openActions).toContain("CONFIRM");
    expect(openActions).toContain("REJECT");
    expect(openActions).toContain("OVERRIDE_BAND");
    expect(openActions).not.toContain("START_WORK");

    const confirmedActions = getAllowedActions(Status.CONFIRMED, "AUTHORITY");
    expect(confirmedActions).toContain("ASSIGN_AGENCY");
    expect(confirmedActions).toContain("CLAIM_FIX");
    expect(confirmedActions).not.toContain("CONFIRM");

    const assignedActions = getAllowedActions(Status.ASSIGNED, "AUTHORITY");
    expect(assignedActions).toContain("START_WORK");
    expect(assignedActions).toContain("REASSIGN_AGENCY");

    const terminalActions = getAllowedActions(Status.VERIFIED_FIXED, "AUTHORITY");
    expect(terminalActions).toHaveLength(0);
  });

  it("Acceptance scenario: Desk A confirms an issue, and Desk B sees 'Confirmed by Desk A'", async () => {
    // 1. Create a fresh OPEN issue
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        band: Band.HIGH,
        priority: 55.0,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    // 2. Desk A logs in and confirms the issue
    vi.mocked(getServerSession).mockResolvedValueOnce(
      createMockSession({ id: deskAUser.id, email: deskAUser.email, role: Role.AUTHORITY })
    );

    const confirmReq = new Request(
      `http://localhost:3000/api/issues/${issue.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIRM",
          note: "Issue verified by road inspection team",
        }),
      }
    );
    const confirmRes = await postAction(confirmReq, {
      params: Promise.resolve({ id: issue.id }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmData = (await confirmRes.json()) as { issue: { status: Status } };
    expect(confirmData.issue.status).toBe(Status.CONFIRMED);

    // 3. Desk B logs in and views the issue log
    vi.mocked(getServerSession).mockResolvedValueOnce(
      createMockSession({ id: deskBUser.id, email: deskBUser.email, role: Role.AUTHORITY })
    );

    const logReq = new Request(`http://localhost:3000/api/issues/${issue.id}/log`);
    const logRes = await getLog(logReq, {
      params: Promise.resolve({ id: issue.id }),
    });
    expect(logRes.status).toBe(200);

    const logData = (await logRes.json()) as { logs: ActionLogItem[] };
    expect(logData.logs).toBeDefined();
    expect(logData.logs.length).toBeGreaterThanOrEqual(1);

    const confirmLog = logData.logs.find((l) => l.action === "CONFIRM");
    expect(confirmLog).toBeDefined();
    // Key acceptance requirement: Desk B sees "Desk A" as the actor
    expect(confirmLog?.actorName).toBe("Desk A");
    expect(confirmLog?.note).toBe("Issue verified by road inspection team");
    expect(confirmLog?.fromStatus).toBe(Status.OPEN);
    expect(confirmLog?.toStatus).toBe(Status.CONFIRMED);
  });
});
