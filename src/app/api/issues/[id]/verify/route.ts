import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { processVerification } from "@/lib/issues/verification";
import { NextResponse } from "next/server";
import { z } from "zod";

const verifySchema = z.object({
  verdict: z.enum(["FIXED", "NOT_FIXED"]),
  note: z.string().optional(),
  evidence: z.object({
    payload: z.object({
      accuracy: z.number().min(0).max(30),
      capturedAt: z.string(),
      lat: z.number(),
      lng: z.number(),
      nonce: z.string(),
      photoHash: z.string(),
      role: z.literal("VERIFY"),
    }),
    signature: z.string().min(1),
    photoBase64: z.string().min(1),
    mimeType: z.string().default("image/jpeg"),
  }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;

    const parsed = await parseJson(req, verifySchema);
    if (parsed.error) {
      return parsed.error;
    }

    const { verdict, note, evidence } = parsed.data;
    const photoBuffer = Buffer.from(evidence.photoBase64, "base64");

    const result = await processVerification({
      issueId: id,
      userId: auth.user.id,
      verdict,
      payload: evidence.payload,
      signature: evidence.signature,
      photoBuffer,
      mimeType: evidence.mimeType,
      note,
    });

    return NextResponse.json(
      {
        success: true,
        issue: result.issue,
        verification: result.verification,
        actionLog: result.actionLog,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Verification processing failed:", error);
    const { status, code, message } = formatSafeApiError(error, "Internal verification error");
    return apiError(status, code, message);
  }
}
