import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  uploadEvidencePhoto,
  validatePhoto,
  computePhotoSha256,
  deriveUrlFromDatabaseString,
  resolveSupabaseUrl,
  StorageValidationError,
  StorageUploadError,
  MAX_PHOTO_SIZE_BYTES,
} from "@/lib/external/storage";
import { sanitizeErrorMessage, formatSafeApiError } from "@/lib/api/errors";

describe("T13 Contract Test: Photo Storage", () => {
  // 1x1 valid sample JPEG header bytes
  const sampleJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
    0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
  ]);

  it("validates fixture image and matches SHA-256 hash", () => {
    const expectedHash = crypto
      .createHash("sha256")
      .update(sampleJpegBuffer)
      .digest("hex");

    const computed = computePhotoSha256(sampleJpegBuffer);
    expect(computed).toBe(expectedHash);

    const validation = validatePhoto(sampleJpegBuffer, "image/jpeg");
    expect(validation.sha256).toBe(expectedHash);
  });

  it("rejects photos exceeding 2 MB limit", () => {
    // 2 MB + 1 byte
    const oversizedBuffer = Buffer.alloc(MAX_PHOTO_SIZE_BYTES + 1);

    expect(() => {
      validatePhoto(oversizedBuffer, "image/jpeg");
    }).toThrowError(StorageValidationError);

    expect(() => {
      validatePhoto(oversizedBuffer, "image/jpeg");
    }).toThrow(/exceeds 2 MB limit/i);
  });

  it("rejects unsupported MIME types (e.g., image/png or text/plain)", () => {
    expect(() => {
      validatePhoto(sampleJpegBuffer, "image/png");
    }).toThrowError(StorageValidationError);

    expect(() => {
      validatePhoto(sampleJpegBuffer, "text/plain");
    }).toThrow(/Only JPEG and WebP are allowed/i);
  });

  it("rejects empty buffer", () => {
    const emptyBuffer = Buffer.alloc(0);
    expect(() => {
      validatePhoto(emptyBuffer, "image/jpeg");
    }).toThrowError(StorageValidationError);
  });

  it("uploads photo and generates path issues/<issueId>/<reportId>.jpg with matched hash", async () => {
    const issueId = "iss_test_123";
    const reportId = "rep_test_456";

    const result = await uploadEvidencePhoto({
      issueId,
      reportId,
      buffer: sampleJpegBuffer,
      mimeType: "image/jpeg",
    });

    const expectedHash = crypto
      .createHash("sha256")
      .update(sampleJpegBuffer)
      .digest("hex");

    expect(result.path).toBe("issues/iss_test_123/rep_test_456.jpg");
    expect(result.photoSha256).toBe(expectedHash);
    expect(result.url).toContain("issues/iss_test_123/rep_test_456.jpg");
    expect(result.sizeBytes).toBe(sampleJpegBuffer.length);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("supports WebP extension in path issues/<issueId>/<reportId>.webp", async () => {
    const issueId = "iss_webp_789";
    const reportId = "rep_webp_101";

    const sampleWebpBuffer = Buffer.from("RIFF....WEBPVP8 ");

    const result = await uploadEvidencePhoto({
      issueId,
      reportId,
      buffer: sampleWebpBuffer,
      mimeType: "image/webp",
    });

    expect(result.path).toBe("issues/iss_webp_789/rep_webp_101.webp");
    expect(result.url).toContain("issues/iss_webp_789/rep_webp_101.webp");
  });

  it("derives canonical Supabase project URL from connection pooling username", () => {
    const derived = deriveUrlFromDatabaseString();
    // In our test environment with APP_DATABASE_URL containing postgres.ofkshdculpzvqergntcs
    expect(derived).toBe("https://ofkshdculpzvqergntcs.supabase.co");
  });

  it("resolves and normalizes SUPABASE_URL, falling back from dead/stale host", () => {
    const resolved = resolveSupabaseUrl();
    expect(resolved).toBeTruthy();
    expect(resolved).toContain("https://");
    expect(resolved).not.toContain("rljzuuwzwsdorimmbglx");
  });

  it("sanitizes error messages by redacting JWTs, connection credentials, and file paths", () => {
    const sensitive =
      "Error: failed at postgresql://postgres.myuser:s3cr3t_pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisToken on file C:\\Users\\secret\\app\\storage.ts";

    const sanitized = sanitizeErrorMessage(sensitive);
    expect(sanitized).not.toContain("s3cr3t_pass");
    expect(sanitized).not.toContain("doNotLeakThisToken");
    expect(sanitized).not.toContain("C:\\Users\\secret");
    expect(sanitized).toContain("[REDACTED]:[REDACTED]");
    expect(sanitized).toContain("[REDACTED_JWT]");
    expect(sanitized).toContain("[internal_path]");
  });

  it("formatSafeApiError formats StorageUploadError with 502 Bad Gateway and sanitized message", () => {
    const uploadErr = new StorageUploadError(
      "Unable to connect to Supabase Storage (fetch failed: host unreachable). Please verify SUPABASE_URL in Vercel environment settings.",
      502
    );

    const formatted = formatSafeApiError(uploadErr);
    expect(formatted.status).toBe(502);
    expect(formatted.code).toBe("STORAGE_UPLOAD_FAILED");
    expect(formatted.message).toContain("fetch failed: host unreachable");
  });
});
