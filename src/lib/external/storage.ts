import "server-only";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface UploadEvidencePhotoParams {
  issueId: string;
  reportId: string;
  buffer: Buffer;
  mimeType: string;
}

export interface UploadEvidencePhotoResult {
  url: string;
  photoSha256: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
}

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

export class StorageUploadError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 502, code = "STORAGE_UPLOAD_FAILED") {
    super(message);
    this.name = "StorageUploadError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function computePhotoSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function validatePhoto(buffer: Buffer, mimeType: string): { sha256: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    throw new StorageValidationError(
      `Unsupported photo format: ${mimeType}. Only JPEG and WebP are allowed.`
    );
  }

  if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
    throw new StorageValidationError(
      `Photo size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 2 MB limit.`
    );
  }

  if (buffer.length === 0) {
    throw new StorageValidationError("Photo buffer is empty.");
  }

  const sha256 = computePhotoSha256(buffer);
  return { sha256 };
}

export async function uploadEvidencePhoto({
  issueId,
  reportId,
  buffer,
  mimeType,
}: UploadEvidencePhotoParams): Promise<UploadEvidencePhotoResult> {
  const { sha256 } = validatePhoto(buffer, mimeType);

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const path = `issues/${issueId}/${reportId}.${ext}`;
  const bucket = env.SUPABASE_EVIDENCE_BUCKET || "evidence";

  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey && !isTest) {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      const isFetchFailed = uploadError.message?.toLowerCase().includes("fetch failed");
      let diagnosticMessage = `Supabase Storage upload failed: ${uploadError.message}`;
      if (isFetchFailed) {
        diagnosticMessage = `Unable to connect to Supabase Storage (fetch failed: host unreachable). Please verify SUPABASE_URL in your environment settings.`;
      } else if (
        uploadError.statusCode === "403" ||
        uploadError.status === 403 ||
        uploadError.message?.includes("AccessDenied")
      ) {
        diagnosticMessage = `Supabase Storage access denied (${uploadError.message}). Please verify SUPABASE_SERVICE_ROLE_KEY.`;
      } else if (uploadError.statusCode === "404" || uploadError.status === 404) {
        diagnosticMessage = `Supabase Storage bucket '${bucket}' not found. Ensure the '${bucket}' bucket exists in your Supabase project.`;
      }
      throw new StorageUploadError(diagnosticMessage, 502, "STORAGE_UPLOAD_FAILED");
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      photoSha256: sha256,
      path,
      sizeBytes: buffer.length,
      mimeType,
    };
  }

  // Test mode or keys-later mode: construct the standard Supabase public object URL
  const syntheticHost = supabaseUrl || "https://ofkshdculpzvqergntcs.supabase.co";
  const publicUrl = `${syntheticHost}/storage/v1/object/public/${bucket}/${path}`;

  return {
    url: publicUrl,
    photoSha256: sha256,
    path,
    sizeBytes: buffer.length,
    mimeType,
  };
}
