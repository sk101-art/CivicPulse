import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import {
  transition,
  InvalidStateTransitionError,
  type IssueAction,
} from "@/lib/issues/stateMachine";
import { verifyEvidence } from "@/lib/evidence/verify";
import { uploadEvidencePhoto } from "@/lib/external/storage";
import { enqueueAiJob } from "@/lib/jobs/aiQueue";
import { recomputeIssuePriority } from "@/lib/jobs/priorityRecompute";
import { haversineDistanceM, type EvidencePayload } from "@/lib/evidence/sign";
import { NextResponse } from "next/server";
import { Role, EvidenceRole } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";

const actionSchema = z.object({
  action: z.enum([
    "CONFIRM",
    "REJECT",
    "ASSIGN_AGENCY",
    "REASSIGN_AGENCY",
    "START_WORK",
    "CLAIM_FIX",
    "OVERRIDE_BAND",
    "REOPEN",
  ]),
  note: z.string().optional(),
  agencyId: z.string().optional(),
  overrideBand: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  evidence: z
    .object({
      reportId: z.string().optional(),
      role: z.string().optional(),
      distanceM: z.number().optional(),
      payload: z
        .object({
          accuracy: z.number().min(0).max(30),
          capturedAt: z.string(),
          lat: z.number(),
          lng: z.number(),
          nonce: z.string(),
          photoHash: z.string(),
          role: z.enum(["REPORT", "CONFIRM", "CLAIM_FIX", "VERIFY"]),
        })
        .optional(),
      signature: z.string().optional(),
      photoBase64: z.string().optional(),
      mimeType: z.string().default("image/jpeg"),
    })
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;

    const parsed = await parseJson(req, actionSchema);
    if (parsed.error) {
      return parsed.error;
    }

    const issue = await prisma.issue.findUnique({
      where: { id },
    });

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue with ID ${id} not found`);
    }

    const body = parsed.data;
    let evidenceContext = body.evidence
      ? {
          reportId: body.evidence.reportId,
          role: body.evidence.role || "CLAIM_FIX",
          distanceM: body.evidence.distanceM,
        }
      : undefined;

    // Handle CLAIM_FIX photo upload and verification if provided
    if (body.action === "CLAIM_FIX") {
      if (body.evidence?.photoBase64 && body.evidence?.payload && body.evidence?.signature) {
        const photoBuffer = Buffer.from(body.evidence.photoBase64, "base64");
        const payload = body.evidence.payload as EvidencePayload;

        const verifyResult = await verifyEvidence(
          auth.user.id,
          payload,
          body.evidence.signature,
          photoBuffer
        );

        if (!verifyResult.valid) {
          return apiError(
            400,
            "EVIDENCE_VERIFICATION_FAILED",
            `Claim evidence verification failed: ${verifyResult.reason}`
          );
        }

        const distanceM = haversineDistanceM(
          issue.lat,
          issue.lng,
          payload.lat,
          payload.lng
        );

        const uploadResult = await uploadEvidencePhoto({
          issueId: issue.id,
          reportId: crypto.randomUUID(),
          buffer: photoBuffer,
          mimeType: body.evidence.mimeType,
        });

        // Persist the CLAIM_FIX evidence Report
        const claimReport = await prisma.report.create({
          data: {
            issueId: issue.id,
            userId: auth.user.id,
            role: EvidenceRole.CLAIM_FIX,
            photoUrl: uploadResult.url,
            photoSha256: uploadResult.photoSha256,
            signature: body.evidence.signature,
            lat: payload.lat,
            lng: payload.lng,
            gpsAccuracyM: payload.accuracy,
            capturedAt: new Date(payload.capturedAt),
            note: body.note,
          },
        });

        evidenceContext = {
          reportId: claimReport.id,
          role: "CLAIM_FIX",
          distanceM,
        };

        // Enqueue G2 AI fix-check job (report photo vs claim photo comparison)
        await enqueueAiJob({
          feature: "G2",
          targetId: claimReport.id,
        }).catch((err) => console.error("Failed to enqueue G2 job:", err));
      }
    }

    // Run centralized state machine
    let transitionResult;
    try {
      transitionResult = transition(
        issue,
        body.action as IssueAction,
        { id: auth.user.id, role: "AUTHORITY" },
        {
          note: body.note,
          agencyId: body.agencyId,
          overrideBand: body.overrideBand,
          evidence: evidenceContext,
        }
      );
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) {
        return apiError(400, "INVALID_STATE_TRANSITION", err.message);
      }
      throw err;
    }

    // Atomic update of Issue and creation of ActionLog
    const { updatedIssue, createdLog } = await prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: transitionResult.issueUpdateData,
      });

      const log = await tx.actionLog.create({
        data: transitionResult.actionLogData,
      });

      return { updatedIssue: updated, createdLog: log };
    });

    await recomputeIssuePriority(issue.id).catch((err) => {
      console.error("Failed to recompute priority after desk action:", err);
    });

    return NextResponse.json(
      {
        issue: updatedIssue,
        actionLog: createdLog,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Desk action execution failed:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal error executing desk action");
  }
}
