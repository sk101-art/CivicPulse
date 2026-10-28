import { NextResponse } from "next/server";
import { z } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  };
  return NextResponse.json(body, { status });
}

export function formatZodError(zodError: z.ZodError): {
  code: string;
  message: string;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};

  for (const issue of zodError.issues) {
    const path = issue.path.join(".");
    const key = path || "root";
    if (!fields[key]) {
      fields[key] = issue.message;
    }
  }

  const primaryMessage =
    zodError.issues[0]?.message || "Input validation failed. Please check the provided values.";

  return {
    code: "VALIDATION_ERROR",
    message: primaryMessage,
    fields,
  };
}

export function validationErrorResponse(zodError: z.ZodError): NextResponse<ApiErrorBody> {
  const formatted = formatZodError(zodError);
  return apiError(400, formatted.code, formatted.message, formatted.fields);
}

/**
 * Strips sensitive credentials, secrets, tokens, and internal filesystem paths from error messages.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== "string") {
    return "An unexpected error occurred.";
  }

  let sanitized = message;

  // 1. Redact database / service URLs with credentials (e.g. postgresql://user:pass@host:port/db)
  sanitized = sanitized.replace(
    /(postgres|postgresql|mysql|mongodb|https?):\/\/[^:\s]+:[^@\s]+@/gi,
    "$1://[REDACTED]:[REDACTED]@"
  );

  // 2. Redact JWT tokens (3 base64url segments separated by dots)
  sanitized = sanitized.replace(
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g,
    "[REDACTED_JWT]"
  );

  // 3. Redact common secret keys and tokens (sb_secret_..., AIzaSy..., gsk_..., etc.)
  sanitized = sanitized.replace(/\b(sb_[a-zA-Z0-9_]{20,})\b/g, "[REDACTED_KEY]");
  sanitized = sanitized.replace(/\b(AIza[a-zA-Z0-9_-]{30,})\b/g, "[REDACTED_KEY]");
  sanitized = sanitized.replace(/\b(gsk_[a-zA-Z0-9_]{20,})\b/g, "[REDACTED_KEY]");
  sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED]");

  // 4. Strip absolute file system paths (e.g. C:\Users\... or /var/task/...)
  sanitized = sanitized.replace(/[A-Z]:\\[^\s:;]+/g, "[internal_path]");
  sanitized = sanitized.replace(/\/(var|home|usr|app|root)\/[^\s:;]+/g, "[internal_path]");

  return sanitized.trim();
}

/**
 * Formats caught errors safely for API responses without leaking secrets.
 */
export function formatSafeApiError(
  error: unknown,
  fallbackMessage = "An unexpected error occurred"
): { status: number; code: string; message: string } {
  if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
    const customErr = error as { statusCode?: number; code?: string; message?: string };
    return {
      status: typeof customErr.statusCode === "number" ? customErr.statusCode : 500,
      code: typeof customErr.code === "string" ? customErr.code : "INTERNAL_ERROR",
      message: sanitizeErrorMessage(customErr.message || fallbackMessage),
    };
  }

  if (error instanceof Error) {
    const rawMessage = error.message;
    const sanitized = sanitizeErrorMessage(rawMessage);

    if (
      error.name === "StorageUploadError" ||
      rawMessage.toLowerCase().includes("supabase storage") ||
      rawMessage.toLowerCase().includes("storage upload")
    ) {
      return {
        status: 502,
        code: "STORAGE_UPLOAD_FAILED",
        message: sanitized,
      };
    }

    if (error.name === "StorageValidationError") {
      return {
        status: 400,
        code: "STORAGE_VALIDATION_ERROR",
        message: sanitized,
      };
    }

    if (error.name === "InvalidStateTransitionError") {
      return {
        status: 400,
        code: "INVALID_STATE_TRANSITION",
        message: sanitized,
      };
    }

    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: sanitized,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: fallbackMessage,
  };
}
