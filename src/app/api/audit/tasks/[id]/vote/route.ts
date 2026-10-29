import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { AuditObserved } from "@prisma/client";
import { submitAuditVote } from "@/lib/audit/blindAudit";

export const dynamic = "force-dynamic";

const submitVoteSchema = z.object({
  observed: z.nativeEnum(AuditObserved),
  deviceHeadingDeg: z.number().min(0).max(360).optional(),
  evidence: z.object({
    payload: z.object({
      accuracy: z.number().min(0).max(30),
      capturedAt: z.string(),
      lat: z.number(),
      lng: z.number(),
      nonce: z.string(),
      photoHash: z.string(),
      role: z.literal("AUDIT"),
    }),
    signature: z.string().min(1),
    photoBase64: z.string().min(1),
    mimeType: z.string().default("image/jpeg"),
  }),
});

/**
 * POST /api/audit/tasks/[id]/vote
 * Submits citizen verdict (INTACT | DAMAGED | CANNOT_SEE) with signed ECDSA evidence
 * and optional device heading check within +/- 45 degrees.
 */
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
    const json = await req.json().catch(() => null);
    if (!json) {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    const parsed = submitVoteSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
      );
    }

    const result = await submitAuditVote({
      userId: auth.user.id,
      taskId: id,
      observed: parsed.data.observed,
      deviceHeadingDeg: parsed.data.deviceHeadingDeg,
      evidence: parsed.data.evidence,
    });

    return NextResponse.json(
      {
        success: true,
        taskId: result.task.id,
        status: result.task.status,
        issueStatus: result.issue.status,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to record audit vote";
    if (
      message.includes("not found") ||
      message.includes("outside tolerance") ||
      message.includes("within 30m") ||
      message.includes("expired") ||
      message.includes("nonce") ||
      message.includes("role must be AUDIT") ||
      message.includes("Cryptographic evidence")
    ) {
      return apiError(400, "AUDIT_VOTE_REJECTED", message);
    }
    if (message.includes("not authorized")) {
      return apiError(403, "FORBIDDEN", message);
    }
    console.error("Failed to submit audit vote:", error);
    return apiError(500, "INTERNAL_ERROR", message);
  }
}
