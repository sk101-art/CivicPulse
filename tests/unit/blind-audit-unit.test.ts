import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateAuditorReliability,
  isHeadingWithinTolerance,
  assignBlindAuditTasks,
  submitAuditVote,
  runDurabilityJob,
} from "@/lib/audit/blindAudit";
import { prisma } from "@/lib/db/prisma";
import {
  Status,
  Role,
  EvidenceRole,
  AuditKind,
  AuditTaskStatus,
  AuditObserved,
} from "@prisma/client";
import * as storage from "@/lib/external/storage";
import * as verifyModule from "@/lib/evidence/verify";
import { AuditError } from "@/lib/audit/rules";

/** Voter is an eligible citizen (account older than 24 h) who has not voted on this issue yet. */
function mockEligibleVoter() {
  vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
    role: Role.CITIZEN,
    createdAt: new Date(Date.now() - 72 * 3600 * 1000),
  } as never);
  vi.spyOn(prisma.auditVote, "findFirst").mockResolvedValue(null);
}

function mockEvidenceAndStorage() {
  vi.spyOn(verifyModule, "verifyEvidence").mockResolvedValue({
    valid: true,
    deviceKeyId: "key-x",
    photoHash: "hash-x",
    nonceId: "audit-challenge",
  });
  vi.spyOn(storage, "uploadEvidencePhoto").mockResolvedValue({
    url: "https://storage.civicpulse.org/photo-x.jpg",
    photoSha256: "hash-x",
    path: "audit/photo-x.jpg",
    sizeBytes: 1024,
    mimeType: "image/jpeg",
  });
  vi.spyOn(prisma.auditorScore, "findUnique").mockResolvedValue({ reliability: 1.0 } as never);
}

/** Transaction mock: returns the given round votes and records issue updates / task closures. */
function mockVoteTransaction(
  cycleVotes: Array<{ userId: string; observed: AuditObserved; weight: number }>,
  issue: object
) {
  const calls = { issueUpdates: [] as unknown[], taskUpdates: 0, closedRounds: 0 };
  vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
    const txMock = {
      report: { create: vi.fn().mockResolvedValue({ id: "rep-audit" }) },
      auditVote: {
        create: vi.fn().mockResolvedValue({ id: "vote" }),
        findMany: vi.fn().mockResolvedValue(cycleVotes),
      },
      auditTask: {
        update: vi.fn().mockImplementation((args) => {
          calls.taskUpdates += 1;
          return Promise.resolve({ id: "task", ...args.data });
        }),
        updateMany: vi.fn().mockImplementation(() => {
          calls.closedRounds += 1;
          return Promise.resolve({ count: 1 });
        }),
      },
      issue: {
        update: vi.fn().mockImplementation((args) => {
          calls.issueUpdates.push(args.data);
          return Promise.resolve({ ...issue, status: args.data.status });
        }),
      },
      actionLog: { create: vi.fn().mockResolvedValue({ id: "log" }) },
      citizenProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: "profile", reputation: 100 }),
        update: vi.fn().mockResolvedValue({}),
      },
      pointLog: { create: vi.fn().mockResolvedValue({}) },
      auditorScore: { upsert: vi.fn().mockResolvedValue({}) },
    };
    return callback(txMock as never);
  });
  return calls;
}

describe("Blind Repair Audit — Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Auditor Reliability Math", () => {
    it("starts at default reliability 0.6 when controlsTotal is 0", () => {
      expect(calculateAuditorReliability(0, 0)).toBe(0.6);
      expect(calculateAuditorReliability(-1, 0)).toBe(0.6);
    });

    it("computes Laplace-smoothed reliability: (passed + 1) / (total + 2)", () => {
      // 1 of 1 passed: 2/3 = 0.6667
      expect(calculateAuditorReliability(1, 1)).toBe(0.6667);
      // 0 of 1 passed: 1/3 = 0.3333
      expect(calculateAuditorReliability(0, 1)).toBe(0.3333);
      // 4 of 5 passed: 5/7 = 0.7143
      expect(calculateAuditorReliability(4, 5)).toBe(0.7143);
      // 10 of 10 passed: 11/12 = 0.9167
      expect(calculateAuditorReliability(10, 10)).toBe(0.9167);
    });
  });

  describe("2. Device Heading Tolerance", () => {
    it("accepts null or undefined heading as optional", () => {
      expect(isHeadingWithinTolerance(null, 90)).toBe(true);
      expect(isHeadingWithinTolerance(undefined, 180)).toBe(true);
      expect(isHeadingWithinTolerance(NaN, 270)).toBe(true);
    });

    it("accepts headings within +/- 45 degrees of challenge bearing", () => {
      expect(isHeadingWithinTolerance(90, 90)).toBe(true);
      expect(isHeadingWithinTolerance(135, 90)).toBe(true);
      expect(isHeadingWithinTolerance(45, 90)).toBe(true);
      expect(isHeadingWithinTolerance(100, 90)).toBe(true);
    });

    it("correctly handles 0 / 360 wrap-around boundary", () => {
      // Challenge bearing 10 deg, heading 350 deg (difference = 20 deg <= 45 deg)
      expect(isHeadingWithinTolerance(350, 10)).toBe(true);
      // Challenge bearing 350 deg, heading 10 deg (difference = 20 deg <= 45 deg)
      expect(isHeadingWithinTolerance(10, 350)).toBe(true);
      // Challenge bearing 0 deg, heading 315 deg (difference = 45 deg <= 45 deg)
      expect(isHeadingWithinTolerance(315, 0)).toBe(true);
    });

    it("rejects headings outside +/- 45 degrees of challenge bearing", () => {
      expect(isHeadingWithinTolerance(140, 90)).toBe(false);
      expect(isHeadingWithinTolerance(40, 90)).toBe(false);
      expect(isHeadingWithinTolerance(270, 90)).toBe(false);
      expect(isHeadingWithinTolerance(300, 0)).toBe(false);
    });
  });

  describe("3. Assignment Eligibility & Distance Widening", () => {
    it("excludes original reporter, desk accounts, and accounts under 24h old", async () => {
      const now = Date.now();
      const mockIssue = {
        id: "issue-123",
        lat: 12.935,
        lng: 77.689,
        reports: [{ userId: "reporter-citizen-1", role: EvidenceRole.REPORT }],
      };

      vi.spyOn(prisma.issue, "findUnique").mockResolvedValue(mockIssue as never);
      vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([]); // no open tasks for this issue yet

      // reporter excluded by `id: { notIn }`, desk accounts by `role: CITIZEN`, < 24h by `createdAt: { lte }`
      const mockCandidates = [
        {
          id: "citizen-eligible-1",
          role: Role.CITIZEN,
          createdAt: new Date(now - 48 * 3600 * 1000), // 48h old
          reports: [{ lat: 12.936, lng: 77.690, createdAt: new Date(now - 2 * 3600 * 1000) }],
          auditTasks: [],
        },
        {
          id: "citizen-eligible-2",
          role: Role.CITIZEN,
          createdAt: new Date(now - 72 * 3600 * 1000), // 72h old
          reports: [{ lat: 12.937, lng: 77.691, createdAt: new Date(now - 4 * 3600 * 1000) }],
          auditTasks: [],
        },
      ];

      vi.spyOn(prisma.user, "findMany").mockResolvedValue(mockCandidates as never);
      vi.spyOn(prisma.report, "findMany").mockResolvedValue([
        { userId: "citizen-eligible-1", lat: 12.936, lng: 77.690, createdAt: new Date(now - 2 * 3600 * 1000) },
        { userId: "citizen-eligible-2", lat: 12.937, lng: 77.691, createdAt: new Date(now - 4 * 3600 * 1000) },
      ] as never);

      const createdTasks: Array<{ assigneeId: string | null; challengeBearingDeg: number; challengeNonce: string }> = [];
      vi.spyOn(prisma.auditTask, "create").mockImplementation((args) => {
        createdTasks.push(args.data as never);
        return Promise.resolve({ id: `task-${createdTasks.length}`, ...args.data }) as never;
      });

      const tasks = await assignBlindAuditTasks("issue-123", 3);

      // Two tasks assigned to the 2 qualified citizens, the 3rd slot becomes ONE open public task
      expect(tasks).toHaveLength(3);
      const assignees = createdTasks.map((t) => t.assigneeId);
      expect(assignees).toContain("citizen-eligible-1");
      expect(assignees).toContain("citizen-eligible-2");
      expect(assignees.filter((a) => a === null)).toHaveLength(1);
    });

    it("never creates a duplicate open task: an open public task or an existing assignee is reused", async () => {
      const now = Date.now();
      vi.spyOn(prisma.issue, "findUnique").mockResolvedValue({
        id: "issue-dup",
        lat: 12.935,
        lng: 77.689,
        reports: [],
      } as never);
      // One assignee already holds an open task and a public task is already open.
      vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([
        { assigneeId: "citizen-eligible-1" },
        { assigneeId: null },
      ] as never);
      vi.spyOn(prisma.user, "findMany").mockResolvedValue([
        { id: "citizen-eligible-1", role: Role.CITIZEN, createdAt: new Date(now - 72 * 3600 * 1000), auditTasks: [] },
      ] as never);
      vi.spyOn(prisma.report, "findMany").mockResolvedValue([
        { userId: "citizen-eligible-1", lat: 12.936, lng: 77.69, createdAt: new Date(now - 3600 * 1000) },
      ] as never);
      const create = vi.spyOn(prisma.auditTask, "create").mockResolvedValue({} as never);

      const tasks = await assignBlindAuditTasks("issue-dup", 3);

      expect(tasks).toHaveLength(0);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("4. Blindness Guarantee", () => {
    it("ensures audit task response contains only coordinates, challenge bearing, nonce, and deadline", async () => {
      const mockTask = {
        id: "task-blind-1",
        issueId: "issue-real-123",
        assigneeId: "citizen-1",
        kind: AuditKind.CLAIM_CHECK,
        dueAt: new Date(Date.now() + 48 * 3600 * 1000),
        challengeBearingDeg: 135,
        challengeNonce: "test-nonce-123",
        status: AuditTaskStatus.OPEN,
        issue: {
          id: "issue-real-123",
          lat: 12.955,
          lng: 77.701,
          address: "ORR Outer Ring Road",
          status: Status.CLAIMED_FIXED,
          contractorName: "Cauvery Infrastructure Ltd.",
          tenderId: "BBMP/W-102",
          repairClaimedAt: new Date(),
          priority: 85.0,
        },
      };

      const blindProjection = {
        id: mockTask.id,
        lat: mockTask.issue.lat,
        lng: mockTask.issue.lng,
        address: mockTask.issue.address,
        challengeBearingDeg: mockTask.challengeBearingDeg,
        challengeNonce: mockTask.challengeNonce,
        dueAt: mockTask.dueAt,
        status: mockTask.status,
      };

      expect(blindProjection.challengeBearingDeg).toBe(135);
      expect(blindProjection.challengeNonce).toBe("test-nonce-123");

      // Assert it STRICTLY DOES NOT LEAK status, contractor, or claim details
      const raw = blindProjection as Record<string, unknown>;
      expect(raw["issueStatus"]).toBeUndefined();
      expect(raw["status"]).toBe(AuditTaskStatus.OPEN); // task status, not issue status
      expect(raw["contractorName"]).toBeUndefined();
      expect(raw["tenderId"]).toBeUndefined();
      expect(raw["repairClaimedAt"]).toBeUndefined();
      expect(raw["kind"]).toBeUndefined(); // User does not know if task is a CONTROL
    });
  });

  describe("5. Decision Thresholds & Quorum", () => {
    const claimedIssue = (id: string) => ({
      id,
      status: Status.CLAIMED_FIXED,
      lat: 12.935,
      lng: 77.689,
      repairClaimedAt: new Date(Date.now() - 3600 * 1000),
      createdAt: new Date(Date.now() - 48 * 3600 * 1000),
      reports: [{ userId: "reporter-1", role: EvidenceRole.REPORT }],
    });
    const openTask = (issue: object, assigneeId: string | null, nonce: string) => ({
      id: "t",
      issueId: (issue as { id: string }).id,
      assigneeId,
      kind: AuditKind.CLAIM_CHECK,
      status: AuditTaskStatus.OPEN,
      dueAt: new Date(Date.now() + 3600 * 1000),
      challengeBearingDeg: 90,
      challengeNonce: nonce,
      issue,
    });
    const vote = (userId: string, nonce: string, observed: AuditObserved) =>
      submitAuditVote({
        userId,
        taskId: "t",
        observed,
        deviceHeadingDeg: 90,
        evidence: {
          payload: {
            accuracy: 5,
            capturedAt: new Date().toISOString(),
            lat: 12.935,
            lng: 77.689,
            nonce,
            photoHash: "hash-x",
            role: "AUDIT" as EvidenceRole,
          },
          signature: "test-ecdsa-sig",
          photoBase64: Buffer.from("fake-jpeg").toString("base64"),
        },
      });

    it("verifies the fix when two independent voters report INTACT with weight >= 1.5", async () => {
      const issue = claimedIssue("issue-decide-1");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, "voter-1", "n-1") as never);
      mockEligibleVoter();
      mockEvidenceAndStorage();
      const calls = mockVoteTransaction(
        [
          { userId: "voter-0", observed: AuditObserved.INTACT, weight: 0.8 },
          { userId: "voter-1", observed: AuditObserved.INTACT, weight: 0.8 },
        ],
        issue
      );

      const result = await vote("voter-1", "n-1", AuditObserved.INTACT);

      expect(result.issue.status).toBe(Status.VERIFIED_FIXED);
      expect(calls.closedRounds).toBe(1); // remaining open tasks of the decided round are closed
    });

    it("a single vote never changes the status, whatever its weight", async () => {
      const issue = claimedIssue("issue-single");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, "voter-1", "n-2") as never);
      mockEligibleVoter();
      mockEvidenceAndStorage();
      const calls = mockVoteTransaction([{ userId: "voter-1", observed: AuditObserved.DAMAGED, weight: 1.0 }], issue);

      const result = await vote("voter-1", "n-2", AuditObserved.DAMAGED);

      expect(result.issue.status).toBe(Status.CLAIMED_FIXED);
      expect(calls.issueUpdates).toHaveLength(0);
    });

    it("repeat votes by the same person count once (two INTACT votes from one user do not verify)", async () => {
      const issue = claimedIssue("issue-repeat");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, "voter-1", "n-3") as never);
      mockEligibleVoter();
      mockEvidenceAndStorage();
      mockVoteTransaction(
        [
          { userId: "voter-1", observed: AuditObserved.INTACT, weight: 1.0 },
          { userId: "voter-1", observed: AuditObserved.INTACT, weight: 1.0 },
        ],
        issue
      );

      const result = await vote("voter-1", "n-3", AuditObserved.INTACT);
      expect(result.issue.status).toBe(Status.CLAIMED_FIXED);
    });

    it("disputes the fix when two independent voters report DAMAGED with weight >= 1.0", async () => {
      const issue = claimedIssue("issue-dispute-2");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, "voter-2", "n-4") as never);
      mockEligibleVoter();
      mockEvidenceAndStorage();
      mockVoteTransaction(
        [
          { userId: "voter-1", observed: AuditObserved.DAMAGED, weight: 0.6 },
          { userId: "voter-2", observed: AuditObserved.DAMAGED, weight: 0.6 },
        ],
        issue
      );

      const result = await vote("voter-2", "n-4", AuditObserved.DAMAGED);
      expect(result.issue.status).toBe(Status.DISPUTED);
    });

    it("a public task stays open after a vote so other eligible citizens can answer it", async () => {
      const issue = claimedIssue("issue-public");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, null, "n-5") as never);
      mockEligibleVoter();
      mockEvidenceAndStorage();
      const calls = mockVoteTransaction([{ userId: "voter-9", observed: AuditObserved.INTACT, weight: 0.6 }], issue);

      const result = await vote("voter-9", "n-5", AuditObserved.INTACT);

      expect(calls.taskUpdates).toBe(0);
      expect(result.task.status).toBe(AuditTaskStatus.OPEN);
    });

    it("rejects audit vote when challengeNonce does not match the task (e.g. from another task or report nonce)", async () => {
      const issue = claimedIssue("issue-nonce-check");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(
        openTask(issue, "voter-3", "issued-task-challenge-nonce-123") as never
      );
      mockEligibleVoter();

      await expect(vote("voter-3", "foreign-or-report-nonce-456", AuditObserved.INTACT)).rejects.toThrow(
        "Invalid challenge nonce for audit task"
      );
    });

    it("a repeated vote on a closed task is a 409, not a server error", async () => {
      const issue = claimedIssue("issue-closed");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue({
        ...openTask(issue, "voter-1", "n-6"),
        status: AuditTaskStatus.DONE,
      } as never);

      const err = await vote("voter-1", "n-6", AuditObserved.INTACT).catch((e) => e);
      expect(err).toBeInstanceOf(AuditError);
      expect(err.status).toBe(409);
    });

    it("a second vote on the same issue by the same person is a 409", async () => {
      const issue = claimedIssue("issue-voted");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, null, "n-7") as never);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        role: Role.CITIZEN,
        createdAt: new Date(Date.now() - 72 * 3600 * 1000),
      } as never);
      vi.spyOn(prisma.auditVote, "findFirst").mockResolvedValue({ id: "earlier-vote" } as never);

      const err = await vote("voter-1", "n-7", AuditObserved.INTACT).catch((e) => e);
      expect(err).toBeInstanceOf(AuditError);
      expect(err.status).toBe(409);
      expect(err.code).toBe("ALREADY_VOTED");
    });

    it("public tasks follow the same eligibility: new accounts, the reporter and desks are refused (403)", async () => {
      const issue = claimedIssue("issue-elig");
      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(openTask(issue, null, "n-8") as never);
      vi.spyOn(prisma.auditVote, "findFirst").mockResolvedValue(null);

      const userSpy = vi.spyOn(prisma.user, "findUnique");
      userSpy.mockResolvedValueOnce({ role: Role.CITIZEN, createdAt: new Date(Date.now() - 3600 * 1000) } as never);
      const tooNew = await vote("new-user", "n-8", AuditObserved.INTACT).catch((e) => e);
      expect(tooNew.status).toBe(403);
      expect(tooNew.code).toBe("ACCOUNT_TOO_NEW");

      userSpy.mockResolvedValueOnce({ role: Role.CITIZEN, createdAt: new Date(Date.now() - 72 * 3600 * 1000) } as never);
      const reporter = await vote("reporter-1", "n-8", AuditObserved.INTACT).catch((e) => e);
      expect(reporter.status).toBe(403);
      expect(reporter.code).toBe("IS_REPORTER");

      userSpy.mockResolvedValueOnce({ role: Role.AUTHORITY, createdAt: new Date(Date.now() - 72 * 3600 * 1000) } as never);
      const desk = await vote("desk-1", "n-8", AuditObserved.INTACT).catch((e) => e);
      expect(desk.code).toBe("NOT_CITIZEN");
    });
  });

  describe("6. Durability Scheduling & Rain Trigger", () => {
    it("creates durability audit tasks at 7, 30, and 90 day milestones or after >= 20 mm rain", async () => {
      const now = new Date();
      const dayMs = 24 * 3600 * 1000;

      const mockVerifiedIssues = [
        {
          id: "issue-durability-7d",
          status: Status.VERIFIED_FIXED,
          repairClaimedAt: new Date(now.getTime() - 8 * dayMs), // 8 days ago (> 7d)
          warrantyUntil: new Date(now.getTime() + 350 * dayMs),
          auditTasks: [], // No existing durability tasks
          isSeed: false,
          reports: [],
        },
      ];

      vi.spyOn(prisma.issue, "findMany").mockResolvedValue(mockVerifiedIssues as never);
      vi.spyOn(prisma.weatherForecast, "findMany").mockResolvedValue([]); // No heavy rain
      vi.spyOn(prisma.user, "findMany").mockResolvedValue([]); // fallback to public queue
      vi.spyOn(prisma.report, "findMany").mockResolvedValue([]);
      vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([]);

      const createdTasks: Array<{ kind: AuditKind; assigneeId: string | null }> = [];
      vi.spyOn(prisma.auditTask, "create").mockImplementation((args) => {
        createdTasks.push(args.data as never);
        return Promise.resolve({ id: `dur-task-${createdTasks.length}`, ...args.data }) as never;
      });
      vi.spyOn(prisma.issue, "findUnique").mockResolvedValue(mockVerifiedIssues[0] as never);

      const result = await runDurabilityJob(now);

      expect(result.processed).toBe(1);
      // Nobody qualified nearby: exactly ONE public durability task (never three duplicates), created as DURABILITY.
      expect(result.createdTasksCount).toBe(1);
      expect(createdTasks[0]).toMatchObject({ kind: AuditKind.DURABILITY, assigneeId: null });
    });
  });
});
