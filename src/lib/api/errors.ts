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
