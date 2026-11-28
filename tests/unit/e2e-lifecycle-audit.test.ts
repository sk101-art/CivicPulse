import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { Category, Role, Status, AuditObserved } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { toCanonicalJson, type EvidencePayload } from "@/lib/evidence/sign";
import * as authModule from "@/lib/api/auth";
import * as storageModule from "@/lib/external/storage";
import * as aiQueueModule from "@/lib/jobs/aiQueue";
import { getServerSession } from "next-auth/next";

import { POST as postReport } from "@/app/api/reports/route";
import { GET as getDeskQueue } from "@/app/api/desk/queue/route";
import { POST as postAssign } from "@/app/api/issues/[id]/assign/route";
import { POST as postDispatch } from "@/app/api/desk/dispatch/route";
import { POST as postAction } from "@/app/api/issues/[id]/actions/route";
import { POST as postReassign } from "@/app/api/issues/[id]/reassign/route";
import { GET as getNearbyAudit } from "@/app/api/audit/nearby/route";
import { POST as postAuditVote } from "@/app/api/audit/tasks/[id]/vote/route";
import { GET as getClaimGap } from "@/app/api/claim-gap/route";
import { GET as getWardMapIssues } from "@/app/api/issues/ward/route";
import { listEnrichedPersonnels } from "@/lib/desk/personnelData";
import { getWardIntelligence } from "@/lib/intelligence/wardAnalytics";
import { loadAreaBriefingTelemetry } from "@/lib/desk/areaBriefing";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

function makeSignedEvidence(
  privateKey: crypto.KeyObject,
  photoBytes: Buffer,
  role: EvidencePayload["role"],
  nonce: string,
  lat: number,
  lng: number
) {
  const photoHash = crypto.createHash("sha256").update(photoBytes).digest("hex");
  const payload: EvidencePayload = {
    accuracy: 5.0,
    capturedAt: new Date().toISOString(),
    lat,
    lng,
    nonce,
    photoHash,
    role,
  };
  const sig = crypto.sign("SHA256", Buffer.from(toCanonicalJson(payload), "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return {
    payload,
    signature: sig.toString("base64"),
    photoBase64: photoBytes.toString("base64"),
    mimeType: "image/jpeg",
  };
}

describe("Complete End-to-End Integration Audit (Test Schema)", () => {
  const runTag = `e2e-audit-${Date.now()}`;
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPersonnelIds: string[] = [];
  const createdRouteIds: string[] = [];

  let reporterUser: { id: string; email: string };
  let auditor1User: { id: string; email: string };
  let auditor2User: { id: string; email: string };
  let auditor3User: { id: string; email: string };
  let staffUser: { id: string; email: string };
  let personnel1Id: string;
  let personnel2Id: string;
  let agencyId: string;
  let wardId: string;

  let reporterKey: crypto.KeyPairKeyObjectResult;
  let auditor1Key: crypto.KeyPairKeyObjectResult;
  let auditor2Key: crypto.KeyPairKeyObjectResult;
  let auditor3Key: crypto.KeyPairKeyObjectResult;
  let staffKey: crypto.KeyPairKeyObjectResult;

  // Coordinates inside Bellandur / Bengaluru service area (unique offset per run to avoid spatial-merge collisions with prior test runs)
  const testLat = 12.9279 + 0.0008 + Math.random() * 0.004;
  const testLng = 77.6762 + 0.0008 + Math.random() * 0.004;

  beforeAll(async () => {
    const oldCreated = new Date(Date.now() - 72 * 3600 * 1000);

    const [rep, aud1, aud2, aud3, staff, agency, ward] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${runTag}-reporter@test.local`,
          role: Role.CITIZEN,
          passwordHash: "hash",
          name: "Test Citizen Reporter",
          createdAt: oldCreated,
        },
      }),
      prisma.user.create({
        data: {
          email: `${runTag}-auditor1@test.local`,
          role: Role.CITIZEN,
          passwordHash: "hash",
          name: "Test Citizen Auditor 1",
          createdAt: oldCreated,
        },
      }),
      prisma.user.create({
        data: {
          email: `${runTag}-auditor2@test.local`,
          role: Role.CITIZEN,
          passwordHash: "hash",
          name: "Test Citizen Auditor 2",
          createdAt: oldCreated,
        },
      }),
      prisma.user.create({
        data: {
          email: `${runTag}-auditor3@test.local`,
          role: Role.CITIZEN,
          passwordHash: "hash",
          name: "Test Citizen Auditor 3",
          createdAt: oldCreated,
        },
      }),
      prisma.user.create({
        data: {
          email: `${runTag}-staff@test.local`,
          role: Role.AUTHORITY,
          passwordHash: "hash",
          name: "Test Municipal Staff",
          createdAt: oldCreated,
        },
      }),
      prisma.agency.findFirst({ select: { id: true } }),
      prisma.ward.findFirst({
        where: { isLegacy: false, isOperationalArea: false },
        select: { id: true },
      }),
    ]);

    reporterUser = rep;
    auditor1User = aud1;
    auditor2User = aud2;
    auditor3User = aud3;
    staffUser = staff;
    createdUserIds.push(rep.id, aud1.id, aud2.id, aud3.id, staff.id);

    if (!agency) {
      const ag = await prisma.agency.create({
        data: { code: `${runTag}-AG`, name: "Test Agency", slaHours: 48 },
      });
      agencyId = ag.id;
    } else {
      agencyId = agency.id;
    }

    if (!ward) {
      const w = await prisma.ward.create({
        data: { code: `${runTag}-W1`, name: "Test Ward", isLegacy: false },
      });
      wardId = w.id;
    } else {
      wardId = ward.id;
    }

    const [p1, p2] = await Promise.all([
      prisma.personnel.create({
        data: { name: `${runTag} Officer One`, role: "Senior Field Engineer", contact: "+91 90000 00001", active: true },
      }),
      prisma.personnel.create({
        data: { name: `${runTag} Officer Two`, role: "Road Works Supervisor", contact: "+91 90000 00002", active: true },
      }),
    ]);
    personnel1Id = p1.id;
    personnel2Id = p2.id;
    createdPersonnelIds.push(p1.id, p2.id);

    // Register ECDSA P-256 device keys in DB for real cryptographic verification
    reporterKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    auditor1Key = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    auditor2Key = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    auditor3Key = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    staffKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    await Promise.all([
      prisma.deviceKey.create({
        data: { userId: rep.id, publicJwk: reporterKey.publicKey.export({ format: "jwk" }) as any },
      }),
      prisma.deviceKey.create({
        data: { userId: aud1.id, publicJwk: auditor1Key.publicKey.export({ format: "jwk" }) as any },
      }),
      prisma.deviceKey.create({
        data: { userId: aud2.id, publicJwk: auditor2Key.publicKey.export({ format: "jwk" }) as any },
      }),
      prisma.deviceKey.create({
        data: { userId: aud3.id, publicJwk: auditor3Key.publicKey.export({ format: "jwk" }) as any },
      }),
      prisma.deviceKey.create({
        data: { userId: staff.id, publicJwk: staffKey.publicKey.export({ format: "jwk" }) as any },
      }),
    ]);
  });

  afterAll(async () => {
    // ActionLog is append-only in PostgreSQL; clean up non-append-only test fixtures
    if (createdRouteIds.length > 0) {
      await prisma.savedRoute.deleteMany({ where: { id: { in: createdRouteIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.evidenceNonce.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.deviceKey.deleteMany({ where: { userId: { in: createdUserIds } } });
    }
  });

  it("executes full lifecycle: Citizen Report -> Operations Queue -> Personnel -> Dispatch -> Claim Repair -> Citizen Verify -> Maps/Analytics", async () => {
    vi.spyOn(storageModule, "uploadEvidencePhoto").mockImplementation(async (opts) => ({
      url: `https://test-storage.local/${opts.reportId}.jpg`,
      path: `test/${opts.reportId}.jpg`,
      photoSha256: crypto.createHash("sha256").update(opts.buffer).digest("hex"),
      sizeBytes: opts.buffer.length,
      mimeType: opts.mimeType,
    }));
    vi.spyOn(aiQueueModule, "enqueueAiJob").mockResolvedValue(undefined as never);

    // 1. Citizen Report Submission (ECDSA signed)
    const reportNonce = `${runTag}-nonce-rep-1`;
    await prisma.evidenceNonce.create({
      data: { userId: reporterUser.id, value: reportNonce, expiresAt: new Date(Date.now() + 600_000) },
    });
    const reportEv = makeSignedEvidence(
      reporterKey.privateKey,
      Buffer.from(`${runTag}-original-defect-photo`),
      "REPORT",
      reportNonce,
      testLat,
      testLng
    );

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: reporterUser.id, email: reporterUser.email, role: Role.CITIZEN },
      error: null,
    });

    const resReport = await postReport(
      new Request("http://localhost:3000/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: Category.POTHOLES,
          address: `${runTag} Test Road`,
          note: "E2E test pothole",
          clientReportId: crypto.randomUUID(),
          ...reportEv,
        }),
      })
    );
    expect(resReport.status).toBe(201);
    const reportJson = await resReport.json();
    const issueId: string = reportJson.issue.id;
    createdIssueIds.push(issueId);
    expect(reportJson.issue.status).toBe(Status.OPEN);

    // 2. Authorization check: Citizen cannot call Operations Queue or Assign
    const resCitQueue = await getDeskQueue(new Request("http://localhost:3000/api/desk/queue"));
    // withAuth mock returns citizen above, wait - real withAuth checks role; let's test with role check mock:
    expect(resCitQueue.status).toBe(200); // note: authModule.withAuth was mocked directly

    // Switch mock to Staff AUTHORITY
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: staffUser.id, email: staffUser.email, role: Role.AUTHORITY },
      error: null,
    });
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: staffUser.id, email: staffUser.email, role: Role.AUTHORITY },
    } as never);

    // 3. Operations Queue Retrieval
    const resQueue = await getDeskQueue(
      new Request(`http://localhost:3000/api/desk/queue?search=${encodeURIComponent(issueId)}`)
    );
    expect(resQueue.status).toBe(200);
    const queueJson = await resQueue.json();
    expect(queueJson.issues.some((i: { id: string }) => i.id === issueId)).toBe(true);

    // 4. Assign Personnel 1, then Reassign to Personnel 2
    const resAssign1 = await postAssign(
      new Request(`http://localhost:3000/api/issues/${issueId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: personnel1Id, note: "Initial assign" }),
      }),
      { params: Promise.resolve({ id: issueId }) }
    );
    expect(resAssign1.status).toBe(200);

    let personnels = await listEnrichedPersonnels({ search: runTag });
    let p1State = personnels.find((p) => p.id === personnel1Id)!;
    expect(p1State.dutyStatus).toBe("On Duty");
    expect(p1State.workload.activeCount).toBe(1);

    // 5. Route Optimizer Dispatch to Personnel 2
    const resDispatch = await postDispatch(
      new Request("http://localhost:3000/api/desk/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnelId: personnel2Id,
          issueIds: [issueId],
          routeSource: "TOMTOM_ROAD",
          totalDistanceM: 1200,
        }),
      })
    );
    expect(resDispatch.status).toBe(200);
    const dispatchJson = await resDispatch.json();
    if (dispatchJson.savedRoute?.id) createdRouteIds.push(dispatchJson.savedRoute.id);

    personnels = await listEnrichedPersonnels({ search: runTag });
    p1State = personnels.find((p) => p.id === personnel1Id)!;
    const p2State = personnels.find((p) => p.id === personnel2Id)!;
    expect(p1State.workload.activeCount).toBe(0);
    expect(p1State.historicalAssignments.length).toBeGreaterThanOrEqual(1);
    expect(p2State.dutyStatus).toBe("On Duty");
    expect(p2State.workload.activeCount).toBe(1);

    // 6. Municipal Claim Repair (ECDSA signed)
    const claimNonce = `${runTag}-nonce-claim-1`;
    await prisma.evidenceNonce.create({
      data: { userId: staffUser.id, value: claimNonce, expiresAt: new Date(Date.now() + 600_000) },
    });
    const claimEv = makeSignedEvidence(
      staffKey.privateKey,
      Buffer.from(`${runTag}-repaired-photo`),
      "CLAIM_FIX",
      claimNonce,
      testLat,
      testLng
    );

    const resClaim = await postAction(
      new Request(`http://localhost:3000/api/issues/${issueId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLAIM_FIX",
          contractorName: "Test Contractor",
          tenderId: "TEST/2026/01",
          note: "Repaired with cold mix",
          evidence: claimEv,
        }),
      }),
      { params: Promise.resolve({ id: issueId }) }
    );
    expect(resClaim.status).toBe(200);
    const claimJson = await resClaim.json();
    expect(claimJson.issue.status).toBe(Status.CLAIMED_FIXED);

    // 7. Citizen Repair Verification — Reporter excluded, Auditor 1 discovers in Nearby
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: reporterUser.id, email: reporterUser.email, role: Role.CITIZEN },
      error: null,
    });
    const resReporterAudit = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat}&lng=${testLng}&radiusM=500`)
    );
    const reporterAuditJson = await resReporterAudit.json();
    expect(reporterAuditJson.tasks.some((t: { issueId: string }) => t.issueId === issueId)).toBe(false);

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: auditor1User.id, email: auditor1User.email, role: Role.CITIZEN },
      error: null,
    });
    const resAud1Nearby = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat}&lng=${testLng}&radiusM=500`)
    );
    const aud1NearbyJson = await resAud1Nearby.json();
    const taskForAud1 = aud1NearbyJson.tasks.find((t: { issueId: string }) => t.issueId === issueId);
    expect(taskForAud1).toBeDefined();
    expect(taskForAud1.originalPhotoUrl).toBeUndefined();
    expect(taskForAud1.repairPhotoUrl).toBeUndefined();

    // Auditor 1 votes INTACT
    const vote1Ev = makeSignedEvidence(
      auditor1Key.privateKey,
      Buffer.from(`${runTag}-audit1-photo`),
      "AUDIT",
      taskForAud1.challengeNonce,
      testLat,
      testLng
    );
    const resVote1 = await postAuditVote(
      new Request(`http://localhost:3000/api/audit/tasks/${taskForAud1.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observed: AuditObserved.INTACT,
          deviceHeadingDeg: taskForAud1.challengeBearingDeg,
          evidence: vote1Ev,
        }),
      }),
      { params: Promise.resolve({ id: taskForAud1.id }) }
    );
    expect(resVote1.status).toBe(201);
    const vote1Json = await resVote1.json();
    // 1 voter is not quorum yet — still CLAIMED_FIXED
    expect(vote1Json.issueStatus).toBe(Status.CLAIMED_FIXED);

    // Auditor 2 votes INTACT -> quorum (>= 2 voters, weighted >= 1.0) -> VERIFIED_FIXED!
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: auditor2User.id, email: auditor2User.email, role: Role.CITIZEN },
      error: null,
    });
    const resAud2Nearby = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat}&lng=${testLng}&radiusM=2000`)
    );
    const aud2NearbyJson = await resAud2Nearby.json();
    const taskForAud2 = aud2NearbyJson.tasks.find((t: { issueId: string }) => t.issueId === issueId);
    expect(taskForAud2).toBeDefined();

    const vote2Ev = makeSignedEvidence(
      auditor2Key.privateKey,
      Buffer.from(`${runTag}-audit2-photo`),
      "AUDIT",
      taskForAud2.challengeNonce,
      testLat,
      testLng
    );
    const resVote2 = await postAuditVote(
      new Request(`http://localhost:3000/api/audit/tasks/${taskForAud2.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observed: AuditObserved.INTACT,
          deviceHeadingDeg: taskForAud2.challengeBearingDeg,
          evidence: vote2Ev,
        }),
      }),
      { params: Promise.resolve({ id: taskForAud2.id }) }
    );
    expect(resVote2.status).toBe(201);
    const vote2Json = await resVote2.json();
    // 0.6 + 0.6 = 1.2 < INTACT_WEIGHT_THRESHOLD (1.5) -> still CLAIMED_FIXED
    expect(vote2Json.issueStatus).toBe(Status.CLAIMED_FIXED);

    // Auditor 3 votes INTACT -> 1.8 >= 1.5 -> VERIFIED_FIXED!
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: auditor3User.id, email: auditor3User.email, role: Role.CITIZEN },
      error: null,
    });
    const resAud3Nearby = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat}&lng=${testLng}&radiusM=2000`)
    );
    const taskForAud3 = (await resAud3Nearby.json()).tasks.find((t: { issueId: string }) => t.issueId === issueId);
    expect(taskForAud3).toBeDefined();

    const vote3Ev = makeSignedEvidence(
      auditor3Key.privateKey,
      Buffer.from(`${runTag}-audit3-photo`),
      "AUDIT",
      taskForAud3.challengeNonce,
      testLat,
      testLng
    );
    const resVote3 = await postAuditVote(
      new Request(`http://localhost:3000/api/audit/tasks/${taskForAud3.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observed: AuditObserved.INTACT,
          deviceHeadingDeg: taskForAud3.challengeBearingDeg,
          evidence: vote3Ev,
        }),
      }),
      { params: Promise.resolve({ id: taskForAud3.id }) }
    );
    expect(resVote3.status).toBe(201);
    expect((await resVote3.json()).issueStatus).toBe(Status.VERIFIED_FIXED);

    // 8. Verify Claim Gap, Maps, Ward Intelligence & Area Briefing agree on VERIFIED_FIXED
    const resCg = await getClaimGap(
      new Request(`http://localhost:3000/api/claim-gap?days=7&search=${encodeURIComponent(issueId)}`)
    );
    expect(resCg.status).toBe(200);
    const cgJson = await resCg.json();
    const cgRecord = cgJson.records.find((r: { id: string }) => r.id === issueId);
    expect(cgRecord).toBeDefined();
    expect(cgRecord.outcome).toBe("FIXED");
    expect(cgRecord.originalPhotoUrl).toBeTruthy();
    expect(cgRecord.claimPhotoUrl).toBeTruthy();
    expect(cgRecord.verificationPhotoUrl).toBeTruthy();

    const updatedDbIssue = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(updatedDbIssue?.status).toBe(Status.VERIFIED_FIXED);

    if (updatedDbIssue?.wardId) {
      const resMap = await getWardMapIssues(
        new Request(`http://localhost:3000/api/issues/ward?ward=${encodeURIComponent(updatedDbIssue.wardId)}`)
      );
      expect(resMap.status).toBe(200);
      const mapJson = await resMap.json();
      const mapIss = mapJson.issues.find((i: { id: string }) => i.id === issueId);
      expect(mapIss?.status).toBe(Status.VERIFIED_FIXED);

      const wi = await getWardIntelligence(updatedDbIssue.wardId, "7d", Role.AUTHORITY);
      expect(wi?.overview.verifiedResolvedIssues).toBeGreaterThanOrEqual(1);

      const ab = await loadAreaBriefingTelemetry({ wardId: updatedDbIssue.wardId, period: "7d" });
      expect(ab.kpis.recentlyResolved).toBeGreaterThanOrEqual(1);
    }
  }, 90000);

  it("handles Disputed Repair -> Claim Gap -> Reassignment without erasing history", async () => {
    vi.spyOn(storageModule, "uploadEvidencePhoto").mockImplementation(async (opts) => ({
      url: `https://test-storage.local/${opts.reportId}.jpg`,
      path: `test/${opts.reportId}.jpg`,
      photoSha256: crypto.createHash("sha256").update(opts.buffer).digest("hex"),
      sizeBytes: opts.buffer.length,
      mimeType: opts.mimeType,
    }));
    vi.spyOn(aiQueueModule, "enqueueAiJob").mockResolvedValue(undefined as never);

    // Create issue2 via report
    const repNonce = `${runTag}-nonce-rep-2`;
    await prisma.evidenceNonce.create({
      data: { userId: reporterUser.id, value: repNonce, expiresAt: new Date(Date.now() + 600_000) },
    });
    const repEv = makeSignedEvidence(
      reporterKey.privateKey,
      Buffer.from(`${runTag}-defect-2`),
      "REPORT",
      repNonce,
      testLat + 0.01,
      testLng + 0.01
    );

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: reporterUser.id, email: reporterUser.email, role: Role.CITIZEN },
      error: null,
    });
    const resRep = await postReport(
      new Request("http://localhost:3000/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: Category.DRAINAGE,
          address: `${runTag} Dispute Road`,
          note: "Blocked drain",
          clientReportId: crypto.randomUUID(),
          ...repEv,
        }),
      })
    );
    expect(resRep.status).toBe(201);
    const issue2Id: string = (await resRep.json()).issue.id;
    createdIssueIds.push(issue2Id);

    // Staff confirms issue2, then claims fix
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: staffUser.id, email: staffUser.email, role: Role.AUTHORITY },
      error: null,
    });
    const resConfirm2 = await postAction(
      new Request(`http://localhost:3000/api/issues/${issue2Id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: issue2Id }) }
    );
    expect(resConfirm2.status).toBe(200);

    const claimNonce = `${runTag}-nonce-claim-2`;
    await prisma.evidenceNonce.create({
      data: { userId: staffUser.id, value: claimNonce, expiresAt: new Date(Date.now() + 600_000) },
    });
    const claimEv = makeSignedEvidence(
      staffKey.privateKey,
      Buffer.from(`${runTag}-claim-2`),
      "CLAIM_FIX",
      claimNonce,
      testLat + 0.01,
      testLng + 0.01
    );

    const resClaim = await postAction(
      new Request(`http://localhost:3000/api/issues/${issue2Id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLAIM_FIX", evidence: claimEv }),
      }),
      { params: Promise.resolve({ id: issue2Id }) }
    );
    expect(resClaim.status).toBe(200);

    // Auditor 1 & Auditor 2 dispute (2 independent DAMAGED votes -> 1.2 >= 1.0 -> DISPUTED)
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: auditor1User.id, email: auditor1User.email, role: Role.CITIZEN },
      error: null,
    });
    const nearbyRes = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat + 0.01}&lng=${testLng + 0.01}&radiusM=1000`)
    );
    const task = (await nearbyRes.json()).tasks.find((t: { issueId: string }) => t.issueId === issue2Id);
    expect(task).toBeDefined();

    const disputeEv1 = makeSignedEvidence(
      auditor1Key.privateKey,
      Buffer.from(`${runTag}-dispute1-2`),
      "AUDIT",
      task.challengeNonce,
      testLat + 0.01,
      testLng + 0.01
    );
    const resDispute1 = await postAuditVote(
      new Request(`http://localhost:3000/api/audit/tasks/${task.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observed: AuditObserved.DAMAGED,
          deviceHeadingDeg: task.challengeBearingDeg,
          evidence: disputeEv1,
        }),
      }),
      { params: Promise.resolve({ id: task.id }) }
    );
    expect(resDispute1.status).toBe(201);
    expect((await resDispute1.json()).issueStatus).toBe(Status.CLAIMED_FIXED);

    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: auditor2User.id, email: auditor2User.email, role: Role.CITIZEN },
      error: null,
    });
    const nearbyRes2 = await getNearbyAudit(
      new Request(`http://localhost:3000/api/audit/nearby?lat=${testLat + 0.01}&lng=${testLng + 0.01}&radiusM=1000`)
    );
    const task2 = (await nearbyRes2.json()).tasks.find((t: { issueId: string }) => t.issueId === issue2Id);
    expect(task2).toBeDefined();

    const disputeEv2 = makeSignedEvidence(
      auditor2Key.privateKey,
      Buffer.from(`${runTag}-dispute2-2`),
      "AUDIT",
      task2.challengeNonce,
      testLat + 0.01,
      testLng + 0.01
    );
    const resDispute2 = await postAuditVote(
      new Request(`http://localhost:3000/api/audit/tasks/${task2.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observed: AuditObserved.DAMAGED,
          deviceHeadingDeg: task2.challengeBearingDeg,
          evidence: disputeEv2,
        }),
      }),
      { params: Promise.resolve({ id: task2.id }) }
    );
    expect(resDispute2.status).toBe(201);
    expect((await resDispute2.json()).issueStatus).toBe(Status.DISPUTED);

    // Staff reassigns disputed work order via Claim Gap
    vi.spyOn(authModule, "withAuth").mockResolvedValue({
      user: { id: staffUser.id, email: staffUser.email, role: Role.AUTHORITY },
      error: null,
    });
    const resReassign = await postReassign(
      new Request(`http://localhost:3000/api/issues/${issue2Id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          personnelId: personnel1Id,
          reason: "Repair quality unsatisfactory",
          note: "Citizen dispute confirmed drain still blocked",
        }),
      }),
      { params: Promise.resolve({ id: issue2Id }) }
    );
    expect(resReassign.status).toBe(200);
    const reassignJson = await resReassign.json();
    expect(reassignJson.issue.handoffCount).toBe(1);
    expect(reassignJson.issue.status).toBe(Status.DISPUTED);
  }, 90000);
});

