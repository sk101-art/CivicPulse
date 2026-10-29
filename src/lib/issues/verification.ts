import { prisma } from "@/lib/db/prisma";
import { haversineDistanceM, type EvidencePayload } from "@/lib/evidence/sign";
import { verifyEvidence } from "@/lib/evidence/verify";
import { uploadEvidencePhoto } from "@/lib/external/storage";
import { transition } from "@/lib/issues/stateMachine";
import { awardPoints } from "@/lib/points";
import { enqueueAiJob } from "@/lib/jobs/aiQueue";
import { Status, EvidenceRole } from "@prisma/client";
import crypto from "crypto";

/**
 * Error carrying an HTTP status and machine-readable code, so the API returns
 * 400/403 with a clear message instead of a generic 500.
 */
export class VerificationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  distanceM?: number;
}

export function calculateVerificationWeight(reputation: number): number {
  return 0.5 + Math.min(0.5, Math.max(0, reputation) / 1000);
}

export async function checkVerifierEligibility(
  issueId: string,
  userId: string,
  payload: { lat: number; lng: number; accuracy: number }
): Promise<EligibilityResult> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      reports: {
        select: { id: true, userId: true, role: true },
      },
      actions: {
        select: { id: true, actorId: true, action: true },
      },
      verifications: {
        where: { verifierId: userId },
        select: { id: true },
      },
    },
  });

  if (!issue) {
    return { eligible: false, reason: "Issue not found" };
  }

  // 1. Issue must be in CLAIMED_FIXED status
  if (issue.status !== Status.CLAIMED_FIXED) {
    return {
      eligible: false,
      reason: `Issue is currently in status '${issue.status}', only issues in 'CLAIMED_FIXED' can be verified or disputed`,
    };
  }

  // 2. Verifier cannot be the issue's original reporter
  const originalReport = issue.reports.find((r) => r.role === EvidenceRole.REPORT);
  if (originalReport && originalReport.userId === userId) {
    return {
      eligible: false,
      reason: "Original reporter cannot verify their own reported issue (You reported this issue)",
    };
  }

  // 3. Verifier cannot be the claimant desk officer who claimed the fix
  const claimReport = issue.reports.find((r) => r.role === EvidenceRole.CLAIM_FIX);
  const claimAction = issue.actions.find((a) => a.action === "CLAIM_FIX");
  if (
    (claimReport && claimReport.userId === userId) ||
    (claimAction && claimAction.actorId === userId)
  ) {
    return {
      eligible: false,
      reason: "Desk officer who claimed this fix cannot verify it",
    };
  }

  // 4. Fetch verifier user details
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true },
  });

  if (!user) {
    return { eligible: false, reason: "User not found" };
  }

  // 5. Account must be older than 24 hours
  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  if (accountAgeMs < 24 * 3600 * 1000) {
    const remainingMs = 24 * 3600 * 1000 - accountAgeMs;
    const remainingHours = Math.max(1, Math.ceil(remainingMs / (3600 * 1000)));
    return {
      eligible: false,
      reason: `Account must be at least 24 hours old to verify fixes (Your account must be at least 24 hours old (eligible in ${remainingHours} h))`,
    };
  }

  // 6. One verification per user per issue
  if (issue.verifications && issue.verifications.length > 0) {
    return {
      eligible: false,
      reason: "User has already submitted a verification for this issue (Already verified by you)",
    };
  }

  // 7. GPS accuracy must be <= 30m
  if (payload.accuracy > 30) {
    return {
      eligible: false,
      reason: `GPS accuracy (${Math.round(payload.accuracy)}m) exceeds maximum allowable threshold of 30m`,
    };
  }

  // 8. Distance must be <= 50m
  const distanceM = haversineDistanceM(issue.lat, issue.lng, payload.lat, payload.lng);
  if (distanceM > 50) {
    return {
      eligible: false,
      reason: `Verifier is ${Math.round(distanceM)}m away; must be within 50m of the issue (You must be within 50 m of the issue)`,
      distanceM,
    };
  }

  return { eligible: true, distanceM };
}

export interface ProcessVerificationInput {
  issueId: string;
  userId: string;
  verdict: "FIXED" | "NOT_FIXED";
  payload: EvidencePayload;
  signature: string;
  photoBuffer: Buffer;
  mimeType?: string;
  note?: string;
}

export async function processVerification(input: ProcessVerificationInput) {
  const {
    issueId,
    userId,
    verdict,
    payload,
    signature,
    photoBuffer,
    mimeType = "image/jpeg",
    note,
  } = input;

  const issueRecord = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, status: true },
  });
  if (!issueRecord) {
    throw new VerificationError(404, "NOT_FOUND", "Issue not found");
  }
  if (issueRecord.status === Status.CLAIMED_FIXED) {
    throw new VerificationError(
      409,
      "AUDIT_IN_PROGRESS",
      "This repair is being independently audited."
    );
  }

  // 1. Verify signed evidence payload and single-use nonce
  // 1. Check verifier eligibility first (cheap, and avoids burning the nonce on an ineligible user)
  const eligibility = await checkVerifierEligibility(issueId, userId, payload);
  if (!eligibility.eligible) {
    throw new VerificationError(
      403,
      "NOT_ELIGIBLE_TO_VERIFY",
      eligibility.reason || "You are not eligible to verify this fix"
    );
  }

  // 2. Verify signed evidence payload (role VERIFY) and single-use nonce
  const verifyResult = await verifyEvidence(userId, payload, signature, photoBuffer, "VERIFY");
  if (!verifyResult.valid) {
    throw new VerificationError(
      400,
      "EVIDENCE_VERIFICATION_FAILED",
      `Evidence verification failed: ${verifyResult.reason}`
    );
  }

  // 3. Compute verification weight based on reputation
  const citizenProfile = await prisma.citizenProfile.findUnique({
    where: { userId },
    select: { reputation: true },
  });
  const reputation = citizenProfile?.reputation ?? 0;
  const weight = calculateVerificationWeight(reputation);

  // 4. Upload evidence photo
  const uploadResult = await uploadEvidencePhoto({
    issueId,
    reportId: crypto.randomUUID(),
    buffer: photoBuffer,
    mimeType,
  });

  // 5. In a database transaction:
  //    - Create Report (role: VERIFY)
  //    - Create Verification
  //    - Re-evaluate verification status
  const txResult = await prisma.$transaction(async (tx) => {
    // a. Create Report
    const report = await tx.report.create({
      data: {
        issueId,
        userId,
        role: EvidenceRole.VERIFY,
        photoUrl: uploadResult.url,
        photoSha256: uploadResult.photoSha256,
        signature,
        nonce: payload.nonce,
        lat: payload.lat,
        lng: payload.lng,
        gpsAccuracyM: payload.accuracy,
        capturedAt: new Date(payload.capturedAt),
        note,
      },
    });

    // b. Create Verification record
    const verification = await tx.verification.create({
      data: {
        issueId,
        verifierId: userId,
        reportId: report.id,
        verdict,
        weight,
      },
    });

    // c. Query existing FIXED verifications to calculate sum
    const allVerifications = await tx.verification.findMany({
      where: { issueId },
    });

    const issue = await tx.issue.findUniqueOrThrow({
      where: { id: issueId },
    });

    let transitionResult = null;

    if (verdict === "NOT_FIXED" && weight >= 0.5) {
      // Single dispute with weight >= 0.5 triggers DISPUTED
      transitionResult = transition(
        issue,
        "DISPUTE_FIX",
        { id: "SYSTEM", role: "SYSTEM" },
        {
          note: note || "Fix disputed by citizen on-site verification",
          verification: { disputeWeight: weight, reportId: report.id },
        }
      );
    } else if (verdict === "FIXED") {
      // Only verifications made after the most recent fix claim count towards this claim.
      const latestClaim = await tx.actionLog.findFirst({
        where: { issueId, action: "CLAIM_FIX" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const claimTime = latestClaim?.createdAt?.getTime() ?? 0;
      const fixedVerifications = allVerifications.filter(
        (v) => v.verdict === "FIXED" && v.createdAt.getTime() >= claimTime
      );
      const sumFixedWeights = fixedVerifications.reduce((sum, v) => sum + v.weight, 0);

      if (sumFixedWeights >= 1.0) {
        transitionResult = transition(
          issue,
          "VERIFY_FIX",
          { id: "SYSTEM", role: "SYSTEM" },
          {
            note: "Fix confirmed by citizen verifications meeting cumulative threshold",
            verification: { sumFixedWeights, reportId: report.id },
          }
        );
      }
    }

    let updatedIssue = issue;
    let createdActionLog = null;

    if (transitionResult) {
      updatedIssue = await tx.issue.update({
        where: { id: issueId },
        data: transitionResult.issueUpdateData,
      });

      createdActionLog = await tx.actionLog.create({
        data: transitionResult.actionLogData,
      });
    }

    // Award citizen points (+20 XP for verified fix check) within transaction
    await awardPoints(tx, {
      userId,
      event: "VERIFICATION_ACCEPTED",
      reason: `Fix verification (${verdict}) recorded`,
    });

    return {
      report,
      verification,
      issue: updatedIssue,
      actionLog: createdActionLog,
    };
  });

  // 6. Enqueue G2 AI fix-check job
  await enqueueAiJob({
    feature: "G2",
    targetId: txResult.report.id,
  }).catch((err) => console.error("Failed to enqueue G2 job for verification:", err));

  return txResult;
}
