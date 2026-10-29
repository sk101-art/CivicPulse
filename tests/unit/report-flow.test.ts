import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/reports/route";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { Category, Role } from "@prisma/client";
import {
  EvidencePayload,
  computePhotoHash,
  signEvidencePayload,
} from "@/lib/evidence/sign";
import { generateEvidenceNonce } from "@/lib/evidence/nonce";
import type { Prisma } from "@prisma/client";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T23 Acceptance: Report flow rewrite and deduplication", () => {
  let citizenUserId: string;
  let deviceKeyPair: CryptoKeyPair;
  const createdIssueIds: string[] = [];
  const createdKeyIds: string[] = [];

  const baseLat = 13.0100;
  const baseLng = 77.5600;
  // 10m north ~ 0.00009 degrees
  const lat10mNorth = baseLat + 0.00009;

  beforeAll(async () => {
    // Clean up any lingering open issues near test coordinates from previous runs
    const existingNear = await prisma.issue.findMany({
      where: {
        lat: { gte: baseLat - 0.005, lte: baseLat + 0.005 },
        lng: { gte: baseLng - 0.005, lte: baseLng + 0.005 },
        status: { notIn: ["REJECTED", "VERIFIED_FIXED"] },
      },
      select: { id: true },
    });
    if (existingNear.length > 0) {
      await prisma.issue.updateMany({
        where: { id: { in: existingNear.map((i) => i.id) } },
        data: { status: "REJECTED" },
      });
    }

    // Create dedicated test citizen user with unique email
    const uniqueEmail = `test-citizen-rf-${Date.now()}@example.local`;
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        role: Role.CITIZEN,
        passwordHash: "hash_test",
      },
    });
    citizenUserId = user.id;

    // Generate and register device key
    deviceKeyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign", "verify"]
    );
    const publicJwk = await crypto.subtle.exportKey("jwk", deviceKeyPair.publicKey);
    const keyRecord = await prisma.deviceKey.create({
      data: {
        userId: citizenUserId,
        publicJwk: publicJwk as Prisma.InputJsonValue,
      },
    });
    createdKeyIds.push(keyRecord.id);
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.report.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      });
      await prisma.issue.updateMany({
        where: { id: { in: createdIssueIds } },
        data: { status: "REJECTED" },
      });
    }
    if (createdKeyIds.length > 0) {
      await prisma.deviceKey.deleteMany({
        where: { id: { in: createdKeyIds } },
      });
    }
  });

  it("citizen files a valid signed report and receives issue and report", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    const photoBuffer = Buffer.from("SYNTHETIC_EVIDENCE_PHOTO_BYTES_1");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(citizenUserId);

    const payload: EvidencePayload = {
      accuracy: 12,
      capturedAt: new Date().toISOString(),
      lat: baseLat,
      lng: baseLng,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, deviceKeyPair.privateKey);

    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.POTHOLES,
        payload,
        signature,
        photoBase64,
        mimeType: "image/jpeg",
        note: "Pothole on left lane near junction",
        sizeClass: "large",
        blockedShare: "part lane",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.issue).toBeDefined();
    expect(body.report).toBeDefined();
    expect(body.isDuplicate).toBe(false);
    expect(body.pointsEarned).toBe(10);
    expect(body.issue.category).toBe(Category.POTHOLES);

    createdIssueIds.push(body.issue.id);
  });

  it("second report 10 metres away merges into the existing issue with CONFIRM role", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    const photoBuffer = Buffer.from("SYNTHETIC_EVIDENCE_PHOTO_BYTES_2_MERGE");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(citizenUserId);

    const payload: EvidencePayload = {
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      lat: lat10mNorth,
      lng: baseLng,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, deviceKeyPair.privateKey);

    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.POTHOLES,
        payload,
        signature,
        photoBase64,
        mimeType: "image/jpeg",
        note: "Confirmed pothole still here",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.isDuplicate).toBe(true);
    expect(body.issue.id).toBe(createdIssueIds[0]);
    expect(body.report.role).toBe("CONFIRM");
    expect(body.pointsEarned).toBe(0);
  });

  it("offline report within 24 hours is accepted with valid signature", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    const photoBuffer = Buffer.from("SYNTHETIC_OFFLINE_PHOTO_BYTES");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    // Offline captured 2 hours ago
    const capturedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const payload: EvidencePayload = {
      accuracy: 15,
      capturedAt,
      lat: 13.0300,
      lng: 77.5700,
      nonce: "offline",
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, deviceKeyPair.privateKey);

    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.DRAINAGE,
        payload,
        signature,
        photoBase64,
        mimeType: "image/jpeg",
        offline: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.issue).toBeDefined();
    createdIssueIds.push(body.issue.id);
  });

  it("offline report older than 24 hours is rejected with OFFLINE_REPORT_EXPIRED", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    const photoBuffer = Buffer.from("SYNTHETIC_EXPIRED_OFFLINE_PHOTO");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    // 25 hours ago
    const oldCapturedAt = new Date(Date.now() - 25 * 3600 * 1000).toISOString();

    const payload: EvidencePayload = {
      accuracy: 15,
      capturedAt: oldCapturedAt,
      lat: 13.0300,
      lng: 77.5700,
      nonce: "offline",
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, deviceKeyPair.privateKey);

    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.DRAINAGE,
        payload,
        signature,
        photoBase64,
        mimeType: "image/jpeg",
        offline: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("OFFLINE_REPORT_EXPIRED");
  });
});
