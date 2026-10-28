import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
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

    // Evidence context is NEVER taken from the client. Only CLAIM_FIX carries evidence, and it is
    // built server-side from a verified, signed on-site photo.
    let claimEvidence:
      | { photoBuffer: Buffer; payload: EvidencePayload; signature: string; mimeType: string; distanceM: number }
      | undefined;

    if (body.action === "CLAIM_FIX") {
      const ev = body.evidence;
      if (!ev?.photoBase64 || !ev?.payload || !ev?.signature) {
        return apiError(
          400,
          "EVIDENCE_REQUIRED",
          "Claiming a fix requires a signed on-site photo taken with the in-app camera"
        );
      }

      const payload = ev.payload as EvidencePayload;
      const distanceM = haversineDistanceM(issue.lat, issue.lng, payload.lat, payload.lng);

      // Dry-run the state machine first so an invalid claim never uploads a photo or burns a nonce.
      try {
        transition(
          issue,
          "CLAIM_FIX",
          { id: auth.user.id, role: "AUTHORITY" },
          { note: body.note, evidence: { role: "CLAIM_FIX", distanceM } }
        );
      } catch (err) {
        if (err instanceof InvalidStateTransitionError) {
          return apiError(400, "INVALID_STATE_TRANSITION", err.message);
        }
        throw err;
      }

      const photoBuffer = Buffer.from(ev.photoBase64, "base64");
      const verifyResult = await verifyEvidence(
        auth.user.id,
        payload,
        ev.signature,
        photoBuffer,
        "CLAIM_FIX"
      );

      if (!verifyResult.valid) {
        return apiError(
          400,
          "EVIDENCE_VERIFICATION_FAILED",
          `Claim evidence verification failed: ${verifyResult.reason}`
        );
      }

      claimEvidence = {
        photoBuffer,
        payload,
        signature: ev.signature,
        mimeType: ev.mimeType,
        distanceM,
      };
    }

    // Validate the transition (without a reportId yet) before any side effects.
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
          evidence: claimEvidence
            ? { role: "CLAIM_FIX", distanceM: claimEvidence.distanceM }
            : undefined,
        }
      );
    } catch (err) {
      if (err instanceof InvalidStateTransitionError) {
        return apiError(400, "INVALID_STATE_TRANSITION", err.message);
      }
      throw err;
    }

    if (body.agencyId && (body.action === "ASSIGN_AGENCY" || body.action === "REASSIGN_AGENCY")) {
      const agency = await prisma.agency.findUnique({ where: { id: body.agencyId }, select: { id: true } });
      if (!agency) {
        return apiError(400, "UNKNOWN_AGENCY", "The selected agency does not exist");
      }
    }

    // Upload the claim photo (outside the DB transaction), then write report + status + log atomically.
    let uploaded: { url: string; photoSha256: string } | undefined;
    if (claimEvidence) {
      uploaded = await uploadEvidencePhoto({
        issueId: issue.id,
        reportId: crypto.randomUUID(),
        buffer: claimEvidence.photoBuffer,
        mimeType: claimEvidence.mimeType,
      });
    }

    const { updatedIssue, createdLog, claimReportId } = await prisma.$transaction(async (tx) => {
      let reportId: string | undefined;

      if (claimEvidence && uploaded) {
        const claimReport = await tx.report.create({
          data: {
            issueId: issue.id,
            userId: auth.user.id,
            role: EvidenceRole.CLAIM_FIX,
            photoUrl: uploaded.url,
            photoSha256: uploaded.photoSha256,
            signature: claimEvidence.signature,
            nonce: claimEvidence.payload.nonce,
            lat: claimEvidence.payload.lat,
            lng: claimEvidence.payload.lng,
            gpsAccuracyM: claimEvidence.payload.accuracy,
            capturedAt: new Date(claimEvidence.payload.capturedAt),
            note: body.note,
          },
        });
        reportId = claimReport.id;
      }

      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: transitionResult.issueUpdateData,
      });

      const log = await tx.actionLog.create({
        data: { ...transitionResult.actionLogData, ...(reportId ? { reportId } : {}) },
      });

      return { updatedIssue: updated, createdLog: log, claimReportId: reportId };
    });

    if (claimReportId) {
      // G2 AI fix-check (report photo vs claim photo); never changes status.
      await enqueueAiJob({ feature: "G2", targetId: claimReportId }).catch((err) =>
        console.error("Failed to enqueue G2 job:", err)
      );
    }

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
    const { status, code, message } = formatSafeApiError(error, "Internal error executing desk action");
    return apiError(status, code, message);
  }
}
