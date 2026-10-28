import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { consumeEvidenceNonce } from "./nonce";
import {
  EvidencePayload,
  toCanonicalJson,
} from "./sign";
import { PILOT_BOUNDS } from "@/lib/api/validate";

export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

export type VerifyEvidenceResult =
  | {
      valid: true;
      deviceKeyId: string;
      photoHash: string;
      nonceId: string;
    }
  | {
      valid: false;
      reason:
        | "PHOTO_HASH_MISMATCH"
        | "TIMESTAMP_EXPIRED"
        | "INVALID_TIMESTAMP"
        | "INVALID_NONCE"
        | "ACCURACY_TOO_LOW"
        | "OUT_OF_BOUNDS"
        | "NO_REGISTERED_DEVICE_KEY"
        | "INVALID_SIGNATURE"
        | "WRONG_EVIDENCE_ROLE";
      details?: unknown;
    };

/**
 * Server-side verification of signed evidence payload and uploaded photo bytes.
 * Checks photo hash, 5-minute capture window, single-use nonce, GPS accuracy, pilot bounds,
 * and ECDSA P-256 signature using the user's registered public key (IEEE P1363).
 */
export async function verifyEvidence(
  userId: string,
  payload: EvidencePayload,
  signatureBase64: string,
  photoBytes: Buffer,
  expectedRole?: EvidencePayload["role"]
): Promise<VerifyEvidenceResult> {
  // 0. The signed role must match the action it is being used for, so a REPORT photo
  //    can never be replayed as a CLAIM_FIX or VERIFY photo (and vice versa).
  if (expectedRole && payload.role !== expectedRole) {
    return {
      valid: false,
      reason: "WRONG_EVIDENCE_ROLE",
      details: { expected: expectedRole, actual: payload.role },
    };
  }

  // 1. Recompute SHA-256 of uploaded photo bytes
  const computedHash = crypto
    .createHash("sha256")
    .update(photoBytes)
    .digest("hex");

  if (computedHash !== payload.photoHash) {
    return {
      valid: false,
      reason: "PHOTO_HASH_MISMATCH",
      details: { expected: payload.photoHash, actual: computedHash },
    };
  }

  // 2. Check capturedAt within 5 minutes of server time
  const capturedTime = new Date(payload.capturedAt).getTime();
  if (isNaN(capturedTime)) {
    return { valid: false, reason: "INVALID_TIMESTAMP" };
  }

  const now = Date.now();
  if (Math.abs(now - capturedTime) > MAX_CLOCK_SKEW_MS) {
    return {
      valid: false,
      reason: "TIMESTAMP_EXPIRED",
      details: { capturedTime, serverTime: now, maxSkewMs: MAX_CLOCK_SKEW_MS },
    };
  }

  // 3. Check GPS accuracy <= 30m
  if (payload.accuracy > PILOT_BOUNDS.maxGpsAccuracyM || payload.accuracy < 0) {
    return {
      valid: false,
      reason: "ACCURACY_TOO_LOW",
      details: {
        accuracy: payload.accuracy,
        maxAllowed: PILOT_BOUNDS.maxGpsAccuracyM,
      },
    };
  }

  // 4. Check coordinates within pilot bounds
  if (
    payload.lat < PILOT_BOUNDS.minLat ||
    payload.lat > PILOT_BOUNDS.maxLat ||
    payload.lng < PILOT_BOUNDS.minLng ||
    payload.lng > PILOT_BOUNDS.maxLng
  ) {
    return {
      valid: false,
      reason: "OUT_OF_BOUNDS",
      details: { lat: payload.lat, lng: payload.lng, bounds: PILOT_BOUNDS },
    };
  }

  // 5. Consume single-use nonce
  const nonceResult = await consumeEvidenceNonce(userId, payload.nonce);
  if (!nonceResult.valid) {
    return {
      valid: false,
      reason: "INVALID_NONCE",
      details: nonceResult.reason,
    };
  }

  // 6. Look up registered active device keys for the user
  const deviceKeys = await prisma.deviceKey.findMany({
    where: {
      userId,
      revokedAt: null,
    },
  });

  if (deviceKeys.length === 0) {
    return {
      valid: false,
      reason: "NO_REGISTERED_DEVICE_KEY",
    };
  }

  // 7. Verify ECDSA signature against user's registered key(s)
  const canonicalString = toCanonicalJson(payload);
  const canonicalBuffer = Buffer.from(canonicalString, "utf8");
  const signatureBuffer = Buffer.from(signatureBase64, "base64");

  let verifiedKeyId: string | null = null;

  for (const dKey of deviceKeys) {
    try {
      const publicKey = crypto.createPublicKey({
        key: dKey.publicJwk as crypto.JsonWebKey,
        format: "jwk",
      });

      const isSignatureValid = crypto.verify(
        "SHA256",
        canonicalBuffer,
        {
          key: publicKey,
          dsaEncoding: "ieee-p1363", // Web Crypto produces IEEE P1363
        },
        signatureBuffer
      );

      if (isSignatureValid) {
        verifiedKeyId = dKey.id;
        break;
      }
    } catch {
      // Continue checking next key in case of multiple registered devices
    }
  }

  if (!verifiedKeyId) {
    return {
      valid: false,
      reason: "INVALID_SIGNATURE",
    };
  }

  return {
    valid: true,
    deviceKeyId: verifiedKeyId,
    photoHash: computedHash,
    nonceId: nonceResult.nonceId,
  };
}
