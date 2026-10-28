export type EvidenceRole = "REPORT" | "CONFIRM" | "CLAIM_FIX" | "VERIFY";

export interface EvidencePayload {
  accuracy: number;
  capturedAt: string; // ISO 8601 string
  lat: number;
  lng: number;
  nonce: string;
  photoHash: string; // SHA-256 hex string
  role: EvidenceRole;
}

/**
 * Serialises an EvidencePayload to a canonical JSON string with strictly sorted keys
 * and no extra whitespace. Must match identically on client and server.
 */
export function toCanonicalJson(payload: EvidencePayload): string {
  return JSON.stringify({
    accuracy: payload.accuracy,
    capturedAt: payload.capturedAt,
    lat: payload.lat,
    lng: payload.lng,
    nonce: payload.nonce,
    photoHash: payload.photoHash,
    role: payload.role,
  });
}

/**
 * Computes SHA-256 hex digest of photo bytes using Web Crypto.
 */
export async function computePhotoHash(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const subtle =
    typeof window !== "undefined"
      ? window.crypto?.subtle
      : (await import("crypto")).webcrypto?.subtle;

  if (!subtle) {
    throw new Error("SubtleCrypto not available");
  }

  const hashBuffer = await subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Signs the canonical JSON payload using the non-extractable ECDSA P-256 CryptoKey.
 * Returns raw IEEE P1363 signature encoded as base64 string.
 */
export async function signEvidencePayload(
  payload: EvidencePayload,
  privateKey: CryptoKey
): Promise<string> {
  const subtle =
    typeof window !== "undefined"
      ? window.crypto?.subtle
      : (await import("crypto")).webcrypto?.subtle;

  if (!subtle) {
    throw new Error("SubtleCrypto not available");
  }

  const canonicalString = toCanonicalJson(payload);
  const encoded = new TextEncoder().encode(canonicalString);

  const signatureBuffer = await subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    encoded
  );

  const bytes = new Uint8Array(signatureBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Calculates Haversine distance in metres between two geographic points.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
