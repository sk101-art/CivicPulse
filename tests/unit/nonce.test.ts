import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { POST } from "@/app/api/evidence/nonce/route";
import {
  generateEvidenceNonce,
  consumeEvidenceNonce,
  NONCE_VALIDITY_MS,
} from "@/lib/evidence/nonce";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T21 Acceptance: Capture nonce", () => {
  const userA = "test-user-t21-a";
  const userB = "test-user-t21-b";
  const createdNonces: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdNonces.length > 0) {
      await prisma.evidenceNonce.deleteMany({
        where: { value: { in: createdNonces } },
      });
    }
  });

  it("POST /api/evidence/nonce returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/evidence/nonce returns 201 with 128-bit nonce and 5-minute expiry", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: userA, role: "CITIZEN", email: "citizen-a@test.local" },
      expires: "1",
    });

    const res = await POST();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.nonce).toBe("string");
    expect(body.nonce.length).toBe(32); // 16 bytes in hex = 32 chars = 128 bits
    createdNonces.push(body.nonce);

    const expiryTime = new Date(body.expiresAt).getTime();
    const now = Date.now();
    expect(expiryTime).toBeGreaterThan(now);
    expect(expiryTime - now).toBeLessThanOrEqual(NONCE_VALIDITY_MS + 2000);
  });

  it("consumeEvidenceNonce succeeds on fresh nonce and marks it used", async () => {
    const { nonce } = await generateEvidenceNonce(userA);
    createdNonces.push(nonce);

    const result = await consumeEvidenceNonce(userA, nonce);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.nonceId).toBeDefined();
    }

    const stored = await prisma.evidenceNonce.findUnique({
      where: { value: nonce },
    });
    expect(stored?.usedAt).not.toBeNull();
  });

  it("reused nonce is rejected with ALREADY_USED", async () => {
    const { nonce } = await generateEvidenceNonce(userA);
    createdNonces.push(nonce);

    const firstConsume = await consumeEvidenceNonce(userA, nonce);
    expect(firstConsume.valid).toBe(true);

    const secondConsume = await consumeEvidenceNonce(userA, nonce);
    expect(secondConsume.valid).toBe(false);
    if (!secondConsume.valid) {
      expect(secondConsume.reason).toBe("ALREADY_USED");
    }
  });

  it("expired nonce is rejected with EXPIRED", async () => {
    // Generate nonce that has already expired
    const expiredRecord = await prisma.evidenceNonce.create({
      data: {
        userId: userA,
        value: "expired-nonce-t21-test-012345678",
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      },
    });
    createdNonces.push(expiredRecord.value);

    const result = await consumeEvidenceNonce(userA, expiredRecord.value);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("EXPIRED");
    }
  });

  it("other user's nonce is rejected with WRONG_USER", async () => {
    const { nonce } = await generateEvidenceNonce(userA);
    createdNonces.push(nonce);

    // userB attempts to consume userA's nonce
    const result = await consumeEvidenceNonce(userB, nonce);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("WRONG_USER");
    }
  });

  it("non-existent nonce is rejected with NOT_FOUND", async () => {
    const result = await consumeEvidenceNonce(userA, "non-existent-nonce-value-99999");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("NOT_FOUND");
    }
  });
});
