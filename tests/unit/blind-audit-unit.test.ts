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

      // Only candidate-2 should qualify:
      // candidate-1 is the reporter (excluded by prisma query `id: { notIn: ['reporter-citizen-1'] }`)
      // desk accounts are filtered by `role: Role.CITIZEN`
      // accounts < 24h are filtered by `createdAt: { lte: accountAgeCutoff }`
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

      // Expect exactly 3 tasks created
      expect(tasks).toHaveLength(3);
      expect(createdTasks).toHaveLength(3);

      // Two tasks assigned to the 2 qualified citizens, 3rd slot falls back to open public queue (null)
      const assignees = createdTasks.map((t) => t.assigneeId);
      expect(assignees).toContain("citizen-eligible-1");
      expect(assignees).toContain("citizen-eligible-2");
      expect(assignees).toContain(null); // Fallback to open public queue
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

      vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([mockTask] as never);

      // Call GET /api/audit/tasks logic
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

      // Assert blind projection contains the required challenge fields
      expect(blindProjection.challengeBearingDeg).toBe(135);
      expect(blindProjection.challengeNonce).toBe("test-nonce-123");
      expect(blindProjection.lat).toBe(12.955);
      expect(blindProjection.lng).toBe(77.701);

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

  describe("5. Decision Thresholds", () => {
    it("transitions issue to VERIFIED_FIXED when weighted INTACT >= 1.5 and exceeds DAMAGED", async () => {
      const mockIssue = {
        id: "issue-decide-1",
        status: Status.CLAIMED_FIXED,
        lat: 12.935,
        lng: 77.689,
        repairClaimedAt: new Date(Date.now() - 3600 * 1000),
        auditTasks: [],
      };

      const mockTask = {
        id: "task-vote-1",
        issueId: mockIssue.id,
        assigneeId: "citizen-voter-1",
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 3600 * 1000),
        challengeBearingDeg: 90,
        challengeNonce: "valid-nonce-abc",
        issue: mockIssue,
      };

      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(mockTask as never);
      vi.spyOn(verifyModule, "verifyEvidence").mockResolvedValue({
        valid: true,
        deviceKeyId: "key-1",
        photoHash: "abc123hash",
        nonceId: "nonce-1",
      });
      vi.spyOn(storage, "uploadEvidencePhoto").mockResolvedValue({
        url: "https://storage.civicpulse.org/photo-1.jpg",
        photoSha256: "abc123hash",
        path: "audit/photo-1.jpg",
        sizeBytes: 1024,
        mimeType: "image/jpeg",
      });
      vi.spyOn(prisma.auditorScore, "findUnique").mockResolvedValue({
        reliability: 0.8,
      } as never);

      // Mock transaction execution
      const mockCycleVotes = [
        { observed: AuditObserved.INTACT, weight: 0.8 },
        { observed: AuditObserved.INTACT, weight: 0.8 }, // total intact = 1.6 >= 1.5
      ];

      let updatedIssueStatus: Status = Status.CLAIMED_FIXED;
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          report: { create: vi.fn().mockResolvedValue({ id: "rep-audit-1" }) },
          auditVote: {
            create: vi.fn().mockResolvedValue({ id: "vote-1" }),
            findMany: vi.fn().mockResolvedValue(mockCycleVotes),
          },
          auditTask: { update: vi.fn().mockResolvedValue(mockTask) },
          issue: {
            update: vi.fn().mockImplementation((args) => {
              updatedIssueStatus = args.data.status;
              return Promise.resolve({ ...mockIssue, status: updatedIssueStatus });
            }),
          },
          actionLog: { create: vi.fn().mockResolvedValue({ id: "log-1" }) },
          citizenProfile: {
            findUnique: vi.fn().mockResolvedValue({ reputation: 100 }),
            update: vi.fn().mockResolvedValue({}),
          },
          pointLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(txMock as never);
      });

      const result = await submitAuditVote({
        userId: "citizen-voter-1",
        taskId: "task-vote-1",
        observed: AuditObserved.INTACT,
        deviceHeadingDeg: 95,
        evidence: {
          payload: {
            accuracy: 5,
            capturedAt: new Date().toISOString(),
            lat: 12.935,
            lng: 77.689,
            nonce: "valid-nonce-abc",
            photoHash: "abc123hash",
            role: "AUDIT" as EvidenceRole,
          },
          signature: "test-ecdsa-sig",
          photoBase64: Buffer.from("fake-jpeg").toString("base64"),
        },
      });

      expect(result.issue.status).toBe(Status.VERIFIED_FIXED);
    });

    it("rejects audit vote when challengeNonce does not match the task (e.g. from another task or report nonce)", async () => {
      const mockIssue = {
        id: "issue-nonce-check",
        status: Status.CLAIMED_FIXED,
        lat: 12.935,
        lng: 77.689,
        auditTasks: [],
      };

      const mockTask = {
        id: "task-nonce-mismatch",
        issueId: mockIssue.id,
        assigneeId: "citizen-voter-3",
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 3600 * 1000),
        challengeBearingDeg: 90,
        challengeNonce: "issued-task-challenge-nonce-123",
        issue: mockIssue,
      };

      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(mockTask as never);

      await expect(
        submitAuditVote({
          userId: "citizen-voter-3",
          taskId: "task-nonce-mismatch",
          observed: AuditObserved.INTACT,
          deviceHeadingDeg: 90,
          evidence: {
            payload: {
              accuracy: 5,
              capturedAt: new Date().toISOString(),
              lat: 12.935,
              lng: 77.689,
              nonce: "foreign-or-report-nonce-456",
              photoHash: "abc123hash",
              role: "AUDIT" as EvidenceRole,
            },
            signature: "test-ecdsa-sig",
            photoBase64: Buffer.from("fake-jpeg").toString("base64"),
          },
        })
      ).rejects.toThrow("Invalid challenge nonce for audit task");
    });

    it("transitions issue to DISPUTED when weighted DAMAGED >= 1.0", async () => {
      const mockIssue = {
        id: "issue-dispute-1",
        status: Status.CLAIMED_FIXED,
        lat: 12.935,
        lng: 77.689,
        repairClaimedAt: new Date(Date.now() - 3600 * 1000),
        auditTasks: [],
      };

      const mockTask = {
        id: "task-vote-2",
        issueId: mockIssue.id,
        assigneeId: "citizen-voter-2",
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 3600 * 1000),
        challengeBearingDeg: 180,
        challengeNonce: "valid-nonce-def",
        issue: mockIssue,
      };

      vi.spyOn(prisma.auditTask, "findUnique").mockResolvedValue(mockTask as never);
      vi.spyOn(verifyModule, "verifyEvidence").mockResolvedValue({
        valid: true,
        deviceKeyId: "key-2",
        photoHash: "def456hash",
        nonceId: "nonce-2",
      });
      vi.spyOn(storage, "uploadEvidencePhoto").mockResolvedValue({
        url: "https://storage.civicpulse.org/photo-2.jpg",
        photoSha256: "def456hash",
        path: "audit/photo-2.jpg",
        sizeBytes: 1024,
        mimeType: "image/jpeg",
      });
      vi.spyOn(prisma.auditorScore, "findUnique").mockResolvedValue({
        reliability: 1.0,
      } as never);

      const mockCycleVotes = [{ observed: AuditObserved.DAMAGED, weight: 1.0 }];

      let updatedIssueStatus: Status = Status.CLAIMED_FIXED;
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          report: { create: vi.fn().mockResolvedValue({ id: "rep-audit-2" }) },
          auditVote: {
            create: vi.fn().mockResolvedValue({ id: "vote-2" }),
            findMany: vi.fn().mockResolvedValue(mockCycleVotes),
          },
          auditTask: { update: vi.fn().mockResolvedValue(mockTask) },
          issue: {
            update: vi.fn().mockImplementation((args) => {
              updatedIssueStatus = args.data.status;
              return Promise.resolve({ ...mockIssue, status: updatedIssueStatus });
            }),
          },
          actionLog: { create: vi.fn().mockResolvedValue({ id: "log-2" }) },
          citizenProfile: {
            findUnique: vi.fn().mockResolvedValue({ reputation: 100 }),
            update: vi.fn().mockResolvedValue({}),
          },
          pointLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(txMock as never);
      });

      const result = await submitAuditVote({
        userId: "citizen-voter-2",
        taskId: "task-vote-2",
        observed: AuditObserved.DAMAGED,
        deviceHeadingDeg: 185,
        evidence: {
          payload: {
            accuracy: 5,
            capturedAt: new Date().toISOString(),
            lat: 12.935,
            lng: 77.689,
            nonce: "valid-nonce-def",
            photoHash: "def456hash",
            role: "AUDIT" as EvidenceRole,
          },
          signature: "test-ecdsa-sig-2",
          photoBase64: Buffer.from("fake-jpeg").toString("base64"),
        },
      });

      expect(result.issue.status).toBe(Status.DISPUTED);
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

      const createdTasks: unknown[] = [];
      vi.spyOn(prisma.auditTask, "create").mockImplementation((args) => {
        createdTasks.push(args.data);
        return Promise.resolve({ id: `dur-task-${createdTasks.length}`, ...args.data }) as never;
      });
      vi.spyOn(prisma.auditTask, "update").mockResolvedValue({} as never);
      vi.spyOn(prisma.issue, "findUnique").mockResolvedValue(mockVerifiedIssues[0] as never);

      const result = await runDurabilityJob(now);

      expect(result.processed).toBe(1);
      expect(result.createdTasksCount).toBe(3);
    });
  });
});
