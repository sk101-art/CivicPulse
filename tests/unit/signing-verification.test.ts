import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  EvidencePayload,
  toCanonicalJson,
  signEvidencePayload,
  computePhotoHash,
} from "@/lib/evidence/sign";
import { verifyEvidence } from "@/lib/evidence/verify";
import { generateEvidenceNonce } from "@/lib/evidence/nonce";

describe("T22 Acceptance: Camera capture, GPS gate and signing", () => {
  const testUserId = "test-user-t22-signing";
  const createdDeviceKeyIds: string[] = [];
  const createdNonceValues: string[] = [];

  afterAll(async () => {
    if (createdDeviceKeyIds.length > 0) {
      await prisma.deviceKey.deleteMany({
        where: { id: { in: createdDeviceKeyIds } },
      });
    }
    if (createdNonceValues.length > 0) {
      await prisma.evidenceNonce.deleteMany({
        where: { value: { in: createdNonceValues } },
      });
    }
  });

  async function setupKeys() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false, // non-extractable private key
      ["sign", "verify"]
    );

    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

    const dbKey = await prisma.deviceKey.create({
      data: {
        userId: testUserId,
        publicJwk: publicJwk as Prisma.InputJsonValue,
      },
    });
    createdDeviceKeyIds.push(dbKey.id);

    return { keyPair, publicJwk, dbKey };
  }

  it("canonical JSON sorts keys alphabetically without whitespace", () => {
    const payload: EvidencePayload = {
      role: "REPORT",
      photoHash: "abcd1234",
      nonce: "nonce-123",
      lng: 77.5946,
      lat: 12.9716,
      capturedAt: "2026-10-28T00:00:00.000Z",
      accuracy: 12.5,
    };

    const canonical = toCanonicalJson(payload);
    expect(canonical).toBe(
      '{"accuracy":12.5,"capturedAt":"2026-10-28T00:00:00.000Z","lat":12.9716,"lng":77.5946,"nonce":"nonce-123","photoHash":"abcd1234","role":"REPORT"}'
    );
  });

  it("valid signature and evidence payload pass verification", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("SYNTHETIC_PHOTO_BYTES_T22_SAMPLE_DATA");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    const payload: EvidencePayload = {
      accuracy: 15,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    const result = await verifyEvidence(testUserId, payload, signature, photoBuffer);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.photoHash).toBe(photoHash);
      expect(result.deviceKeyId).toBeDefined();
    }
  });

  it("one changed byte in photo fails with PHOTO_HASH_MISMATCH", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("ORIGINAL_PHOTO_BYTES_FOR_HASH_TEST");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    const payload: EvidencePayload = {
      accuracy: 12,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    // Tamper one byte in photoBuffer
    const tamperedBuffer = Buffer.from(photoBuffer);
    tamperedBuffer[0] = tamperedBuffer[0] ^ 0xff;

    const result = await verifyEvidence(testUserId, payload, signature, tamperedBuffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("PHOTO_HASH_MISMATCH");
    }
  });

  it("changed lat fails with INVALID_SIGNATURE", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("PHOTO_BYTES_FOR_LAT_TAMPER_CHECK");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    const payload: EvidencePayload = {
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    // Tamper with lat
    const tamperedPayload: EvidencePayload = {
      ...payload,
      lat: 12.9720,
    };

    const result = await verifyEvidence(testUserId, tamperedPayload, signature, photoBuffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("INVALID_SIGNATURE");
    }
  });

  it("old timestamp (>5 min) fails with TIMESTAMP_EXPIRED", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("PHOTO_BYTES_FOR_TIMESTAMP_CHECK");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    // 10 minutes ago
    const oldCapturedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const payload: EvidencePayload = {
      accuracy: 10,
      capturedAt: oldCapturedAt,
      lat: 12.9352,
      lng: 77.6245,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    const result = await verifyEvidence(testUserId, payload, signature, photoBuffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("TIMESTAMP_EXPIRED");
    }
  });

  it("accuracy > 30m fails with ACCURACY_TOO_LOW", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("PHOTO_BYTES_FOR_ACCURACY_CHECK");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    const payload: EvidencePayload = {
      accuracy: 45, // exceeds 30m limit
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    const result = await verifyEvidence(testUserId, payload, signature, photoBuffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("ACCURACY_TOO_LOW");
    }
  });

  it("coordinates outside pilot bounds fail with OUT_OF_BOUNDS", async () => {
    const { keyPair } = await setupKeys();

    const photoBuffer = Buffer.from("PHOTO_BYTES_FOR_BOUNDS_CHECK");
    const photoHash = await computePhotoHash(photoBuffer);

    const { nonce } = await generateEvidenceNonce(testUserId);
    createdNonceValues.push(nonce);

    const payload: EvidencePayload = {
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      lat: 5.0, // outside pilot bounds [11.5, 14.5]
      lng: 77.5946,
      nonce,
      photoHash,
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    const result = await verifyEvidence(testUserId, payload, signature, photoBuffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("OUT_OF_BOUNDS");
    }
  });

  it("CaptureCamera component source contains no file input elements", () => {
    const componentPath = path.resolve(__dirname, "../../src/components/evidence/CaptureCamera.tsx");
    const content = fs.readFileSync(componentPath, "utf8");

    // Must not have type="file" or <input ... file
    expect(content).not.toMatch(/type=["']file["']/i);
    expect(content).not.toMatch(/<input/i);
  });
});
