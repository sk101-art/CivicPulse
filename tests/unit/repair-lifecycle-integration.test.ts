import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditKind, AuditTaskStatus, EvidenceRole, Role, Status } from "@prisma/client";
import { POST as postAction } from "@/app/api/issues/[id]/actions/route";
import { POST as postAssign } from "@/app/api/issues/[id]/assign/route";
import { GET as getNearbyAudit } from "@/app/api/audit/nearby/route";
import * as authModule from "@/lib/api/auth";
import * as verifyModule from "@/lib/evidence/verify";
import * as storageModule from "@/lib/external/storage";
import * as blindAuditModule from "@/lib/audit/blindAudit";
import * as aiQueueModule from "@/lib/jobs/aiQueue";
import * as priorityModule from "@/lib/jobs/priorityRecompute";
import { prisma } from "@/lib/db/prisma";

describe("Municipal Repair Lifecycle -> Citizen Verification Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("SET_STATUS blocks jumping directly to CLAIMED_FIXED or VERIFIED_FIXED", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue({
      id: "issue-1",
      status: Status.IN_PROGRESS,
      lat: 12.95,
      lng: 77.70,
    } as never);

    const resClaim = await postAction(
      new Request("http://localhost:3000/api/issues/issue-1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_STATUS", targetStatus: Status.CLAIMED_FIXED }),
      }),
      { params: Promise.resolve({ id: "issue-1" }) }
    );
    expect(resClaim.status).toBe(400);

    const resVerify = await postAction(
      new Request("http://localhost:3000/api/issues/issue-1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_STATUS", targetStatus: Status.VERIFIED_FIXED }),
      }),
      { params: Promise.resolve({ id: "issue-1" }) }
    );
    expect(resVerify.status).toBe(400);
  });

  it("POST /api/issues/[id]/assign preserves prior assignments and records ASSIGN_PERSONNEL", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue({
      id: "issue-1",
      status: Status.CONFIRMED,
    } as never);
    vi.spyOn(prisma.personnel, "findUnique").mockResolvedValue({
      id: "pers-1",
      name: "Ravi Kumar",
      role: "Senior Field Engineer",
      contact: "+91 98765 43021",
      active: true,
    } as never);

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createAssignment = vi.fn().mockResolvedValue({
      id: "assign-2",
      issueId: "issue-1",
      personnelId: "pers-1",
      status: "PENDING",
      personnel: { id: "pers-1", name: "Ravi Kumar", role: "Senior Field Engineer" },
    });
    const updateIssue = vi.fn().mockResolvedValue({
      id: "issue-1",
      status: Status.ASSIGNED,
    });
    const createLog = vi.fn().mockResolvedValue({ id: "log-1" });

    vi.spyOn(prisma, "$transaction").mockImplementation(async (fn: any) =>
      fn({
        assignment: { updateMany, create: createAssignment },
        issue: { update: updateIssue },
        actionLog: { create: createLog },
      })
    );

    const res = await postAssign(
      new Request("http://localhost:3000/api/issues/issue-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: "pers-1", note: "Inspect drainage" }),
      }),
      { params: Promise.resolve({ id: "issue-1" }) }
    );

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(createAssignment).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledTimes(1);
  });

  it("CLAIM_FIX ensures an open public AuditTask exists even if 3 citizens were already assigned", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "desk-1", email: "desk@civicpulse.local", role: Role.AUTHORITY },
      error: null,
    });
    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue({
      id: "issue-claim-1",
      status: Status.IN_PROGRESS,
      lat: 12.955,
      lng: 77.701,
      isSeed: false,
    } as never);
    vi.spyOn(verifyModule, "verifyEvidence").mockResolvedValue({
      valid: true,
      deviceKeyId: "key-1",
      photoHash: "abc",
      nonceId: "nonce-1",
    });
    vi.spyOn(storageModule, "uploadEvidencePhoto").mockResolvedValue({
      url: "https://storage.local/claim.jpg",
      path: "issues/issue-claim-1/claim.jpg",
      photoSha256: "abc",
      sizeBytes: 1024,
      mimeType: "image/jpeg",
    });
    vi.spyOn(aiQueueModule, "enqueueAiJob").mockResolvedValue(undefined as never);
    vi.spyOn(priorityModule, "recomputeIssuePriority").mockResolvedValue(undefined as never);

    vi.spyOn(prisma, "$transaction").mockImplementation(async (fn: any) =>
      fn({
        report: { create: vi.fn().mockResolvedValue({ id: "rep-claim-1" }) },
        issue: {
          update: vi.fn().mockResolvedValue({
            id: "issue-claim-1",
            status: Status.CLAIMED_FIXED,
          }),
        },
        actionLog: { create: vi.fn().mockResolvedValue({ id: "log-claim-1" }) },
      })
    );

    // Suppose assignBlindAuditTasks returned 3 specific citizens (no null public task)
    vi.spyOn(blindAuditModule, "assignBlindAuditTasks").mockResolvedValue([
      { id: "t1", assigneeId: "c1" },
      { id: "t2", assigneeId: "c2" },
      { id: "t3", assigneeId: "c3" },
    ] as never);
    vi.spyOn(prisma.auditTask, "findFirst").mockResolvedValue(null);
    const createAuditTask = vi.spyOn(prisma.auditTask, "create").mockResolvedValue({
      id: "t-public",
      assigneeId: null,
    } as never);

    const res = await postAction(
      new Request("http://localhost:3000/api/issues/issue-claim-1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLAIM_FIX",
          contractorName: "Cauvery Infra",
          tenderId: "BBMP/2026/01",
          evidence: {
            photoBase64: Buffer.from("fake-jpg").toString("base64"),
            signature: "sig",
            payload: {
              accuracy: 5,
              capturedAt: new Date().toISOString(),
              lat: 12.955,
              lng: 77.701,
              nonce: "n1",
              photoHash: "abc",
              role: "CLAIM_FIX",
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: "issue-claim-1" }) }
    );

    expect(res.status).toBe(200);
    expect(createAuditTask).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueId: "issue-claim-1",
          assigneeId: null,
          kind: AuditKind.CLAIM_CHECK,
          status: AuditTaskStatus.OPEN,
        }),
      })
    );
  });

  it("GET /api/audit/nearby surfaces newly CLAIMED_FIXED issues with repair evidence and excludes reporter", async () => {
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: "citizen-verifier", email: "verifier@civicpulse.local", role: Role.CITIZEN },
      error: null,
    });
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      role: Role.CITIZEN,
      createdAt: new Date(Date.now() - 72 * 3600 * 1000),
    } as never);
    vi.spyOn(prisma.auditVote, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.ward, "findFirst").mockResolvedValue({ id: "ward-bellandur" } as never);
    vi.spyOn(prisma.issue, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.ward, "findMany").mockResolvedValue([
      { id: "ward-bellandur", code: "150", wardNumber: 150, name: "Bellandur", corporation: { name: "GBA East" } },
    ] as never);

    vi.spyOn(prisma.auditTask, "findMany").mockResolvedValue([
      {
        id: "task-1",
        issueId: "issue-claimed-1",
        kind: AuditKind.CLAIM_CHECK,
        dueAt: new Date(Date.now() + 24 * 3600 * 1000),
        challengeBearingDeg: 90,
        challengeNonce: "nonce-xyz",
        issue: {
          id: "issue-claimed-1",
          category: "POTHOLES",
          status: Status.CLAIMED_FIXED,
          lat: 12.93,
          lng: 77.67,
          address: "Bellandur Main Road",
          wardId: "ward-bellandur",
          contractorName: "Cauvery Infra",
          tenderId: "BBMP/W-150",
          repairClaimedAt: new Date(),
          createdAt: new Date(Date.now() - 48 * 3600 * 1000),
          agency: { name: "BBMP Roads", code: "BBMP" },
          reports: [
            {
              userId: "desk-1",
              role: EvidenceRole.CLAIM_FIX,
              photoUrl: "https://storage.local/repaired.jpg",
              capturedAt: new Date(),
              note: "Resurfaced pothole",
              createdAt: new Date(),
            },
            {
              userId: "citizen-reporter",
              role: EvidenceRole.REPORT,
              photoUrl: "https://storage.local/defect.jpg",
              capturedAt: new Date(Date.now() - 48 * 3600 * 1000),
              note: "Deep pothole near signal",
              createdAt: new Date(Date.now() - 48 * 3600 * 1000),
            },
          ],
        },
      },
    ] as never);

    const res = await getNearbyAudit(
      new Request("http://localhost:3000/api/audit/nearby?wardId=ward-bellandur")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eligible).toBe(true);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).toMatchObject({
      issueId: "issue-claimed-1",
      originalPhotoUrl: "https://storage.local/defect.jpg",
      repairPhotoUrl: "https://storage.local/repaired.jpg",
      contractorName: "Cauvery Infra",
      tenderId: "BBMP/W-150",
      agencyName: "BBMP Roads",
      repairNote: "Resurfaced pothole",
      originalNote: "Deep pothole near signal",
    });
  });
});
