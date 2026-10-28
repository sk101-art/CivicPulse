import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/reports/route";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { Category, Role, type Prisma } from "@prisma/client";
import {
  EvidencePayload,
  computePhotoHash,
  signEvidencePayload,
} from "@/lib/evidence/sign";
import { generateEvidenceNonce } from "@/lib/evidence/nonce";
import {
  StorageUploadError,
  StorageValidationError,
} from "@/lib/external/storage";
import * as storageModule from "@/lib/external/storage";
import { formatSafeApiError, sanitizeErrorMessage } from "@/lib/api/errors";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/external/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/storage")>();
  return {
    ...actual,
    uploadEvidencePhoto: vi.fn(),
  };
});

describe("Storage Error Diagnostics & Secret Sanitization Tests", () => {
  let citizenUserId: string;
  let deviceKeyPair: CryptoKeyPair;

  beforeAll(async () => {
    const uniqueEmail = `test-storage-diag-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const citizen = await prisma.user.create({
      data: {
        email: uniqueEmail,
        name: "Storage Diagnostic Citizen",
        role: Role.CITIZEN,
        passwordHash: "dummy_hash_for_test",
      },
    });

    citizenUserId = citizen.id;
    deviceKeyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"]
    );

    const jwk = await crypto.subtle.exportKey("jwk", deviceKeyPair.publicKey);
    await prisma.deviceKey.create({
      data: {
        userId: citizenUserId,
        publicJwk: jwk as Prisma.InputJsonValue,
      },
    });
  });

  afterAll(async () => {
    if (citizenUserId) {
      await prisma.deviceKey.deleteMany({ where: { userId: citizenUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: citizenUserId } }).catch(() => {});
    }
  });

  it("POST /api/reports returns HTTP 502 with STORAGE_UPLOAD_FAILED and clear diagnostic message when storage is unreachable", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    vi.mocked(storageModule.uploadEvidencePhoto).mockRejectedValueOnce(
      new StorageUploadError(
        "Unable to connect to Supabase Storage (fetch failed: host unreachable). Please verify SUPABASE_URL in Vercel environment settings.",
        502,
        "STORAGE_UPLOAD_FAILED"
      )
    );

    const photoBuffer = Buffer.from("SYNTHETIC_DIAGNOSTIC_PHOTO");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    const nonceRecord = await generateEvidenceNonce(citizenUserId);
    const payload: EvidencePayload = {
      accuracy: 12,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce: nonceRecord.nonce,
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
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("STORAGE_UPLOAD_FAILED");
    expect(data.error.message).toContain("fetch failed: host unreachable");
    expect(data.error.message).toContain("Please verify SUPABASE_URL");
  });

  it("POST /api/reports returns HTTP 400 with STORAGE_VALIDATION_ERROR when photo validation fails", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: citizenUserId, role: Role.CITIZEN, email: "citizen@example.com" },
      expires: "1",
    });

    vi.mocked(storageModule.uploadEvidencePhoto).mockRejectedValueOnce(
      new StorageValidationError("Photo size (2.50 MB) exceeds 2 MB limit.")
    );

    const photoBuffer = Buffer.from("SYNTHETIC_OVERSIZED_PHOTO");
    const photoBase64 = photoBuffer.toString("base64");
    const photoHash = await computePhotoHash(photoBuffer);

    const nonceRecord = await generateEvidenceNonce(citizenUserId);
    const payload: EvidencePayload = {
      accuracy: 12,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce: nonceRecord.nonce,
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
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe("STORAGE_VALIDATION_ERROR");
    expect(data.error.message).toContain("exceeds 2 MB limit");
  });

  it("sanitizes error responses so database credentials, JWTs, and local filepaths are never leaked", () => {
    const rawErrorMessage =
      "Failed to connect to postgresql://postgres.myproject:SuperSecretPassword123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres using eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.someSecretToken at C:\\Users\\user\\CivicPulse\\src\\lib\\db.ts";

    const sanitizedDirect = sanitizeErrorMessage(rawErrorMessage);
    expect(sanitizedDirect).toContain("[REDACTED]:[REDACTED]");

    const formatted = formatSafeApiError(new Error(rawErrorMessage));

    expect(formatted.message).not.toContain("SuperSecretPassword123");
    expect(formatted.message).not.toContain("someSecretToken");
    expect(formatted.message).not.toContain("C:\\Users\\user");
    expect(formatted.message).toContain("[REDACTED]:[REDACTED]");
    expect(formatted.message).toContain("[REDACTED_JWT]");
    expect(formatted.message).toContain("[internal_path]");
  });

  it("throws StorageUploadError with 502 Bad Gateway and clear message when storage upload fails", () => {
    const error = new StorageUploadError(
      "Unable to connect to Supabase Storage (fetch failed: host unreachable). Please verify SUPABASE_URL in your environment settings.",
      502
    );

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe("STORAGE_UPLOAD_FAILED");
    expect(error.message).toContain("verify SUPABASE_URL");
  });
});
