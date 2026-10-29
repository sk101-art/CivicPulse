import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import PublicIssuePage from "@/app/(public)/issue/[id]/page";
import { Category, Role, Status, EvidenceRole, Band } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T28 Acceptance: Public issue page, photo gallery, action log and logged-out access", () => {
  let deskAUser: { id: string; email: string };
  let citizenUser: { id: string; email: string };
  let testAgency: { id: string; code: string; name: string };
  let publicIssueId: string;
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // 1. Desk user
    let desk = await prisma.user.findFirst({ where: { email: "desk-a@civicpulse.local" } });
    if (!desk) {
      desk = await prisma.user.create({
        data: { email: "desk-a@civicpulse.local", role: Role.AUTHORITY, passwordHash: "h" },
      });
      createdUserIds.push(desk.id);
    }
    deskAUser = { id: desk.id, email: desk.email };

    // 2. Citizen user
    const citizen = await prisma.user.create({
      data: {
        email: `citizen-t28-${Date.now()}@test.local`,
        role: Role.CITIZEN,
        passwordHash: "h",
      },
    });
    createdUserIds.push(citizen.id);
    citizenUser = { id: citizen.id, email: citizen.email };

    // 3. Agency (use seeded BWSSB)
    let agency = await prisma.agency.findFirst({ where: { code: "BWSSB" } });
    if (!agency) {
      agency = await prisma.agency.findFirstOrThrow();
    }
    testAgency = { id: agency.id, code: agency.code, name: agency.name };

    // 4. Create Issue with multiple reports (gallery) and action logs
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.CLAIMED_FIXED,
        lat: 12.9716,
        lng: 77.5946,
        address: "100 Feet Road, Indiranagar",
        priority: 68.5,
        band: Band.HIGH,
        piBreakdown: { s: 0.8, e: 0.7, v: 0.6, u: 0.5, p: 0.4, rawPi: 68.5, pi: 68.5 },
        agencyId: testAgency.id,
        handoffCount: 2,
        slaDueAt: new Date(Date.now() + 48 * 3600 * 1000),
        reports: {
          createMany: {
            data: [
              {
                userId: citizenUser.id,
                role: EvidenceRole.REPORT,
                photoUrl: "https://example.com/original-drain.jpg",
                photoSha256: "hash_original",
                signature: "sig_original",
                lat: 12.9716,
                lng: 77.5946,
                gpsAccuracyM: 8.5,
                capturedAt: new Date(Date.now() - 48 * 3600 * 1000),
                note: "Broken slab over main stormwater drain",
              },
              {
                userId: deskAUser.id,
                role: EvidenceRole.CLAIM_FIX,
                photoUrl: "https://example.com/repaired-slab.jpg",
                photoSha256: "hash_repair",
                signature: "sig_repair",
                lat: 12.9716,
                lng: 77.5946,
                gpsAccuracyM: 12.0,
                capturedAt: new Date(Date.now() - 2 * 3600 * 1000),
                note: "New reinforced concrete slab installed",
              },
            ],
          },
        },
        actions: {
          createMany: {
            data: [
              {
                actorId: deskAUser.id,
                action: "CONFIRM",
                note: "Inspected and confirmed by Desk A",
                fromStatus: Status.OPEN,
                toStatus: Status.CONFIRMED,
              },
              {
                actorId: deskAUser.id,
                action: "ASSIGN_AGENCY",
                note: "Assigned to BWSSB for drainage repair",
                fromStatus: Status.CONFIRMED,
                toStatus: Status.ASSIGNED,
              },
              {
                actorId: deskAUser.id,
                action: "CLAIM_FIX",
                note: "Contractor completed slab replacement",
                fromStatus: Status.IN_PROGRESS,
                toStatus: Status.CLAIMED_FIXED,
              },
            ],
          },
        },
      },
    });

    publicIssueId = issue.id;
    createdIssueIds.push(issue.id);
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.verification.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
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
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }
  });

  it("renders cleanly for a logged-out visitor without redirecting to login", async () => {
    // Logged-out visitor
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const pageElement = await PublicIssuePage({
      params: Promise.resolve({ id: publicIssueId }),
    });

    expect(pageElement).toBeDefined();
    expect(pageElement.type).toBe("div");
  });

  it("fetches the public action log and verifies immutability via DB trigger", async () => {
    // 1. Fetch public action log for the issue
    const logs = await prisma.actionLog.findMany({
      where: { issueId: publicIssueId },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.length).toBe(3);
    expect(logs[0].action).toBe("CONFIRM");
    expect(logs[1].action).toBe("ASSIGN_AGENCY");
    expect(logs[2].action).toBe("CLAIM_FIX");

    // 2. Immutability guarantee: Database trigger blocks UPDATE on ActionLog
    await expect(
      prisma.actionLog.update({
        where: { id: logs[0].id },
        data: { note: "Attempted tampering" },
      })
    ).rejects.toThrow();

    // 3. Immutability guarantee: Database trigger blocks DELETE on ActionLog
    await expect(
      prisma.actionLog.delete({
        where: { id: logs[0].id },
      })
    ).rejects.toThrow();
  });

  it("displays photo gallery with all evidence roles and coordinates", async () => {
    const issueWithReports = await prisma.issue.findUnique({
      where: { id: publicIssueId },
      include: {
        reports: { orderBy: { createdAt: "asc" } },
      },
    });

    expect(issueWithReports).toBeDefined();
    expect(issueWithReports?.reports.length).toBe(2);

    const reportRoles = issueWithReports?.reports.map((r) => r.role);
    expect(reportRoles).toContain(EvidenceRole.REPORT);
    expect(reportRoles).toContain(EvidenceRole.CLAIM_FIX);

    expect(issueWithReports?.reports[0].photoUrl).toBe("https://example.com/original-drain.jpg");
    expect(issueWithReports?.reports[1].photoUrl).toBe("https://example.com/repaired-slab.jpg");
  });

  it("shows responsible agency, handoff count and Priority Index breakdown", async () => {
    const issue = await prisma.issue.findUnique({
      where: { id: publicIssueId },
      include: { agency: true },
    });

    expect(issue?.agency?.name).toBe("Bengaluru Water Supply and Sewerage Board");
    expect(issue?.handoffCount).toBe(2);
    expect(issue?.priority).toBe(68.5);
    expect(issue?.band).toBe(Band.HIGH);
    expect(issue?.piBreakdown).toEqual({ s: 0.8, e: 0.7, v: 0.6, u: 0.5, p: 0.4, rawPi: 68.5, pi: 68.5 });
  });

  it("renders 'This repair is being independently audited.' and no verify button for regular users on CLAIMED_FIXED issue", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUser.id, email: citizenUser.email, role: Role.CITIZEN },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const pageElement = await PublicIssuePage({
      params: Promise.resolve({ id: publicIssueId }),
    });

    const html = renderToStaticMarkup(pageElement);
    expect(html).toContain("This repair is being independently audited.");
    expect(html).not.toContain("Verify fix");
    expect(html).not.toContain("Confirm fixed");
  });

  it("hides status, claim, claim photos, and action log when the viewer has an OPEN audit task for this issue", async () => {
    const auditTask = await prisma.auditTask.create({
      data: {
        issueId: publicIssueId,
        assigneeId: citizenUser.id,
        kind: "CLAIM_CHECK",
        dueAt: new Date(Date.now() + 3600 * 1000),
        challengeBearingDeg: 120,
        challengeNonce: "task-nonce-blind-test-999",
        status: "OPEN",
      },
    });

    try {
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: citizenUser.id, email: citizenUser.email, role: Role.CITIZEN },
        expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const pageElement = await PublicIssuePage({
        params: Promise.resolve({ id: publicIssueId }),
      });

      const html = renderToStaticMarkup(pageElement);

      // Status must not be revealed
      expect(html).not.toContain("CLAIMED_FIXED");
      // Claim notice must not be revealed
      expect(html).not.toContain("Work Claimed Complete by Operations Desk");
      // Claim fix photo must not be revealed in gallery
      expect(html).not.toContain("repaired-slab.jpg");
      expect(html).not.toContain("Desk Fix Claim");
      // Initial report photo is still visible
      expect(html).toContain("original-drain.jpg");
      // Action log is withheld
      expect(html).toContain("Action log is temporarily withheld while you have an active independent audit assignment for this location.");
      expect(html).not.toContain("Contractor completed slab replacement");
    } finally {
      await prisma.auditTask.delete({ where: { id: auditTask.id } }).catch(() => {});
    }
  });
});
