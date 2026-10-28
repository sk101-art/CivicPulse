import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

export const NONCE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

export type NonceVerificationResult =
  | { valid: true; nonceId: string }
  | {
      valid: false;
      reason: "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" | "WRONG_USER";
    };

/**
 * Issues a cryptographically random 128-bit (16-byte) nonce tied to the user,
 * valid for 5 minutes and single use.
 */
export async function generateEvidenceNonce(userId: string): Promise<{
  nonce: string;
  expiresAt: Date;
  id: string;
}> {
  const nonce = crypto.randomBytes(16).toString("hex"); // 128-bit random nonce
  const expiresAt = new Date(Date.now() + NONCE_VALIDITY_MS);

  const record = await prisma.evidenceNonce.create({
    data: {
      userId,
      value: nonce,
      expiresAt,
    },
  });

  return {
    nonce: record.value,
    expiresAt: record.expiresAt,
    id: record.id,
  };
}

/**
 * Validates and atomically consumes a nonce. Single-use: marks usedAt = now().
 */
export async function consumeEvidenceNonce(
  userId: string,
  nonceValue: string
): Promise<NonceVerificationResult> {
  const record = await prisma.evidenceNonce.findUnique({
    where: { value: nonceValue },
  });

  if (!record) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  if (record.userId !== userId) {
    return { valid: false, reason: "WRONG_USER" };
  }

  if (record.usedAt !== null) {
    return { valid: false, reason: "ALREADY_USED" };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, reason: "EXPIRED" };
  }

  // Atomically mark as used
  const updated = await prisma.evidenceNonce.updateMany({
    where: {
      id: record.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return { valid: false, reason: "ALREADY_USED" };
  }

  return { valid: true, nonceId: record.id };
}
