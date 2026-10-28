import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  calculateVerificationWeight,
  checkVerifierEligibility,
  processVerification,
} from "@/lib/issues/verification";
import { POST as verifyRoute } from "@/app/api/issues/[id]/verify/route";
import { generateEvidenceNonce } from "@/lib/evidence/nonce";
import {
  computePhotoHash,
  signEvidencePayload,
  type EvidencePayload,
} from "@/lib/evidence/sign";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { Category, Role, Status, EvidenceRole, type Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import crypto from "crypto";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T27 Acceptance: Claim fix and citizen verification", () => {
  let deskUser: { id: string; email: string };
  let originalReporter: { id: string; email: string };
  let newCitizenUser: { id: string; email: string };
  let eligibleCitizen1: { id: string; email: string; keyPair: CryptoKeyPair };
  let eligibleCitizen2: { id: string; email: string; keyPair: CryptoKeyPair };

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  const createMockSession = (user: { id: string; email: string; role: Role }): Session => ({
    user: { id: user.id, role: user.role, email: user.email },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  beforeAll(async () => {
    // 1. Desk user
    let desk = await prisma.user.findFirst({ where: { email: "desk-a@civicpulse.local" } });
    if (!desk) {
      desk = await prisma.user.create({
        data: {
          email: "desk-a@civicpulse.local",
          role: Role.AUTHORITY,
          passwordHash: "h",
          createdAt: new Date(Date.now() - 48 * 3600 * 1000),
        },
      });
      createdUserIds.push(desk.id);
    } else {
      await prisma.user.update({
        where: { id: desk.id },
        data: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
      });
    }
    deskUser = { id: desk.id, email: desk.email };

    // 2. Original reporter (account older than 24h)
    const reporter = await prisma.user.create({
      data: {
        email: `reporter-${Date.now()}@test.local`,
        role: Role.CITIZEN,
        passwordHash: "h",
        createdAt: new Date(Date.now() - 48 * 3600 * 1000),
      },
    });
    createdUserIds.push(reporter.id);
    originalReporter = { id: reporter.id, email: reporter.email };

    // 3. Brand new citizen (created just now, < 24h old)
    const newCitizen = await prisma.user.create({
      data: {
        email: `newbie-${Date.now()}@test.local`,
        role: Role.CITIZEN,
        passwordHash: "h",
        createdAt: new Date(),
      },
    });
    createdUserIds.push(newCitizen.id);
    newCitizenUser = { id: newCitizen.id, email: newCitizen.email };

    // 4. Eligible citizen 1 (account > 24h, reputation = 0 -> weight = 0.5)
    const cit1 = await prisma.user.create({
      data: {
        email: `verifier1-${Date.now()}@test.local`,
        role: Role.CITIZEN,
        passwordHash: "h",
        createdAt: new Date(Date.now() - 72 * 3600 * 1000),
        citizenProfile: {
          create: { reputation: 0 },
        },
      },
    });
    createdUserIds.push(cit1.id);
    const keyPair1 = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const jwk1 = await crypto.subtle.exportKey("jwk", keyPair1.publicKey);
    await prisma.deviceKey.create({
      data: { userId: cit1.id, publicJwk: jwk1 as Prisma.InputJsonValue },
    });
    eligibleCitizen1 = { id: cit1.id, email: cit1.email, keyPair: keyPair1 };

    // 5. Eligible citizen 2 (account > 24h, reputation = 250 -> weight = 0.75)
    const cit2 = await prisma.user.create({
      data: {
        email: `verifier2-${Date.now()}@test.local`,
        role: Role.CITIZEN,
        passwordHash: "h",
        createdAt: new Date(Date.now() - 72 * 3600 * 1000),
        citizenProfile: {
          create: { reputation: 250 },
        },
      },
    });
    createdUserIds.push(cit2.id);
    const keyPair2 = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const jwk2 = await crypto.subtle.exportKey("jwk", keyPair2.publicKey);
    await prisma.deviceKey.create({
      data: { userId: cit2.id, publicJwk: jwk2 as Prisma.InputJsonValue },
    });
    eligibleCitizen2 = { id: cit2.id, email: cit2.email, keyPair: keyPair2 };
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
      await prisma.deviceKey.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.evidenceNonce.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.pointLog.deleteMany({
        where: { citizen: { userId: { in: createdUserIds } } },
      }).catch(() => {});
      await prisma.citizenProfile.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }
  });

  it("calculates verifier weight correctly according to reputation formula", () => {
    expect(calculateVerificationWeight(0)).toBe(0.5);
    expect(calculateVerificationWeight(250)).toBe(0.75);
    expect(calculateVerificationWeight(500)).toBe(1.0);
    expect(calculateVerificationWeight(1000)).toBe(1.0);
    expect(calculateVerificationWeight(2000)).toBe(1.0); // capped at 1.0
  });

  it("enforces all eligibility rules strictly", async () => {
    // Create an issue in CLAIMED_FIXED
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        reports: {
          createMany: {
            data: [
              {
                userId: originalReporter.id,
                role: EvidenceRole.REPORT,
                photoUrl: "https://example.com/r.jpg",
                photoSha256: "hash_r",
                signature: "sig_r",
                lat: 12.9716,
                lng: 77.5946,
                gpsAccuracyM: 10,
                capturedAt: new Date(Date.now() - 48 * 3600 * 1000),
              },
              {
                userId: deskUser.id,
                role: EvidenceRole.CLAIM_FIX,
                photoUrl: "https://example.com/c.jpg",
                photoSha256: "hash_c",
                signature: "sig_c",
                lat: 12.9716,
                lng: 77.5946,
                gpsAccuracyM: 10,
                capturedAt: new Date(Date.now() - 2 * 3600 * 1000),
              },
            ],
          },
        },
        actions: {
          create: {
            actorId: deskUser.id,
            action: "CLAIM_FIX",
            fromStatus: Status.IN_PROGRESS,
            toStatus: Status.CLAIMED_FIXED,
          },
        },
      },
    });
    createdIssueIds.push(issue.id);

    // Rule 1: Not in CLAIMED_FIXED status
    const openIssue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(openIssue.id);
    const r1 = await checkVerifierEligibility(openIssue.id, eligibleCitizen1.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 10,
    });
    expect(r1.eligible).toBe(false);
    expect(r1.reason).toContain("CLAIMED_FIXED");

    // Rule 2: Account < 24h old
    const r2 = await checkVerifierEligibility(issue.id, newCitizenUser.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 10,
    });
    expect(r2.eligible).toBe(false);
    expect(r2.reason).toContain("24 hours");

    // Rule 3: Original reporter cannot verify
    const r3 = await checkVerifierEligibility(issue.id, originalReporter.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 10,
    });
    expect(r3.eligible).toBe(false);
    expect(r3.reason).toContain("Original reporter");

    // Rule 4: Claimant desk officer cannot verify
    const r4 = await checkVerifierEligibility(issue.id, deskUser.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 10,
    });
    expect(r4.eligible).toBe(false);
    expect(r4.reason).toContain("Desk officer who claimed this fix");

    // Rule 5: GPS accuracy > 30m
    const r5 = await checkVerifierEligibility(issue.id, eligibleCitizen1.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 35,
    });
    expect(r5.eligible).toBe(false);
    expect(r5.reason).toContain("GPS accuracy");

    // Rule 6: Distance > 50m
    const r6 = await checkVerifierEligibility(issue.id, eligibleCitizen1.id, {
      lat: 12.9725, // ~100m away
      lng: 77.5946,
      accuracy: 10,
    });
    expect(r6.eligible).toBe(false);
    expect(r6.reason).toContain("within 50m");

    // Valid check: Eligible citizen passes
    const validCheck = await checkVerifierEligibility(issue.id, eligibleCitizen1.id, {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 10,
    });
    expect(validCheck.eligible).toBe(true);
  });

  it("Acceptance scenario 1: Citizen disputes fix -> status transitions to DISPUTED", async () => {
    // Create issue in CLAIMED_FIXED
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    // Prepare signed VERIFY evidence payload
    const nonce = await generateEvidenceNonce(eligibleCitizen1.id);
    const photoBuffer = Buffer.from("dispute_photo_bytes_test_evidence");
    const photoHash = await computePhotoHash(photoBuffer);

    const payload: EvidencePayload = {
      accuracy: 8.0,
      capturedAt: new Date().toISOString(),
      lat: 12.9716,
      lng: 77.5946,
      nonce: nonce.nonce,
      photoHash,
      role: "VERIFY",
    };

    const signature = await signEvidencePayload(payload, eligibleCitizen1.keyPair.privateKey);

    // Call verify route as citizen 1 with NOT_FIXED
    vi.mocked(getServerSession).mockResolvedValueOnce(
      createMockSession({
        id: eligibleCitizen1.id,
        email: eligibleCitizen1.email,
        role: Role.CITIZEN,
      })
    );

    const req = new Request(`http://localhost:3000/api/issues/${issue.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verdict: "NOT_FIXED",
        note: "Pothole is still completely open and filled with water",
        evidence: {
          payload,
          signature,
          photoBase64: photoBuffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      }),
    });

    const res = await verifyRoute(req, {
      params: Promise.resolve({ id: issue.id }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verification.verdict).toBe("NOT_FIXED");
    expect(data.verification.weight).toBe(0.5);
    // Key state machine check: Transitions to DISPUTED
    expect(data.issue.status).toBe(Status.DISPUTED);
    expect(data.actionLog.action).toBe("DISPUTE_FIX");
    expect(data.actionLog.fromStatus).toBe(Status.CLAIMED_FIXED);
    expect(data.actionLog.toStatus).toBe(Status.DISPUTED);
  });

  it("Acceptance scenario 2: Cumulative verification weights meet 1.0 -> transitions to VERIFIED_FIXED", async () => {
    // Create issue in CLAIMED_FIXED
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.CLAIMED_FIXED,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    // Citizen 1 submits FIXED verification (weight = 0.5)
    const nonce1 = await generateEvidenceNonce(eligibleCitizen1.id);
    const photoBuffer1 = Buffer.from("fix_photo_1");
    const photoHash1 = await computePhotoHash(photoBuffer1);

    const payload1: EvidencePayload = {
      accuracy: 10.0,
      capturedAt: new Date().toISOString(),
      lat: 12.9716,
      lng: 77.5946,
      nonce: nonce1.nonce,
      photoHash: photoHash1,
      role: "VERIFY",
    };
    const signature1 = await signEvidencePayload(payload1, eligibleCitizen1.keyPair.privateKey);

    const res1 = await processVerification({
      issueId: issue.id,
      userId: eligibleCitizen1.id,
      verdict: "FIXED",
      payload: payload1,
      signature: signature1,
      photoBuffer: photoBuffer1,
      note: "Drain cover is securely installed",
    });

    // Sum is < 1.0 -> status should still be CLAIMED_FIXED
    expect(res1.verification.weight).toBeGreaterThanOrEqual(0.5);
    expect(res1.verification.weight).toBeLessThan(1.0);
    expect(res1.issue.status).toBe(Status.CLAIMED_FIXED);
    expect(res1.actionLog).toBeNull();

    // Citizen 2 submits FIXED verification (weight = 0.75, sum = 0.5 + 0.75 = 1.25 >= 1.0)
    const nonce2 = await generateEvidenceNonce(eligibleCitizen2.id);
    const photoBuffer2 = Buffer.from("fix_photo_2");
    const photoHash2 = await computePhotoHash(photoBuffer2);

    const payload2: EvidencePayload = {
      accuracy: 12.0,
      capturedAt: new Date().toISOString(),
      lat: 12.9716,
      lng: 77.5946,
      nonce: nonce2.nonce,
      photoHash: photoHash2,
      role: "VERIFY",
    };
    const signature2 = await signEvidencePayload(payload2, eligibleCitizen2.keyPair.privateKey);

    const res2 = await processVerification({
      issueId: issue.id,
      userId: eligibleCitizen2.id,
      verdict: "FIXED",
      payload: payload2,
      signature: signature2,
      photoBuffer: photoBuffer2,
      note: "Confirmed fixed and clean",
    });

    // Sum meets 1.0 -> transitions to VERIFIED_FIXED!
    expect(res2.verification.weight).toBe(0.75);
    expect(res2.issue.status).toBe(Status.VERIFIED_FIXED);
    expect(res2.actionLog).not.toBeNull();
    expect(res2.actionLog?.action).toBe("VERIFY_FIX");
    expect(res2.actionLog?.fromStatus).toBe(Status.CLAIMED_FIXED);
    expect(res2.actionLog?.toStatus).toBe(Status.VERIFIED_FIXED);
  });
});
