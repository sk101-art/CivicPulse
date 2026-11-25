import { NextResponse } from "next/server";
import { z } from "zod";
import { AssignmentStatus, Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { TEXT_LIMITS } from "@/lib/validation/limits";

export const dynamic = "force-dynamic";

export const REASSIGNMENT_REASONS = [
  "Repair quality unsatisfactory",
  "Contractor failed to meet requirements",
  "SLA breach",
  "Insufficient repair evidence",
  "Original agency unavailable",
  "Repeated repair failure",
  "Incorrect original assignment",
  "Other",
] as const;

const reassignSchema = z.object({
  agencyId: z.string().min(1, "New agency is required"),
  personnelId: z.string().optional().nullable(),
  reason: z.string().min(1, "Reassignment reason is required"),
  otherReason: z.string().max(TEXT_LIMITS.actionNote).optional(),
  note: z.string().max(TEXT_LIMITS.actionNote).optional(),
});

/**
 * POST /api/issues/[id]/reassign
 * Transactionally reassigns a disputed/claimed/active repair work order to a
 * new eligible agency and optional active field personnel, preserving all
 * previous assignment, repair, and verification history.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) return auth.error;

    const { id } = await params;
    const parsed = await parseJson(req, reassignSchema);
    if (parsed.error) return parsed.error;

    const { agencyId, personnelId, reason, otherReason, note } = parsed.data;

    const effectiveReason =
      reason === "Other" ? (otherReason || "").trim() : reason.trim();
    if (!effectiveReason) {
      return apiError(
        400,
        "REASON_REQUIRED",
        "A reassignment reason explanation is required."
      );
    }

    const [issue, newAgency, newPersonnel] = await Promise.all([
      prisma.issue.findUnique({
        where: { id },
        include: {
          agency: { select: { id: true, code: true, name: true } },
          assignments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { personnel: { select: { id: true, name: true, role: true } } },
          },
        },
      }),
      prisma.agency.findUnique({ where: { id: agencyId } }),
      personnelId
        ? prisma.personnel.findUnique({ where: { id: personnelId } })
        : Promise.resolve(null),
    ]);

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue ${id} not found`);
    }
    if (!newAgency) {
      return apiError(400, "INVALID_AGENCY", "Selected agency is not registered or unavailable.");
    }
    if (personnelId && (!newPersonnel || !newPersonnel.active)) {
      return apiError(
        400,
        "INVALID_PERSONNEL",
        "Selected personnel is inactive or not authorized for municipal assignment."
      );
    }

    const prevAgencyLabel = issue.agency
      ? `${issue.agency.name} (${issue.agency.code})`
      : "Unassigned";
    const prevPersonnelLabel = issue.assignments[0]?.personnel
      ? `${issue.assignments[0].personnel.name} (${issue.assignments[0].personnel.role})`
      : "Unassigned";
    const newPersonnelLabel = newPersonnel
      ? `${newPersonnel.name} (${newPersonnel.role})`
      : "Unassigned";

    const result = await prisma.$transaction(async (tx) => {
      // Preserve previous assignments (mark open PENDING/IN_PROGRESS as COMPLETED instead of deleting)
      if (newPersonnel) {
        await tx.assignment.updateMany({
          where: {
            issueId: issue.id,
            status: { in: [AssignmentStatus.PENDING, AssignmentStatus.IN_PROGRESS] },
          },
          data: { status: AssignmentStatus.COMPLETED },
        });

        await tx.assignment.create({
          data: {
            issueId: issue.id,
            personnelId: newPersonnel.id,
            status: AssignmentStatus.PENDING,
          },
        });
      }

      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          agencyId: newAgency.id,
          handoffCount: { increment: 1 },
        },
        include: {
          agency: { select: { id: true, code: true, name: true } },
          assignments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { personnel: { select: { id: true, name: true, role: true } } },
          },
        },
      });

      const auditNote = [
        `Reassigned work order from ${prevAgencyLabel} to ${newAgency.name} (${newAgency.code})`,
        `Personnel: ${prevPersonnelLabel} -> ${newPersonnelLabel}`,
        `Reason: ${effectiveReason}`,
        note?.trim() ? `Notes: ${note.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const actionLog = await tx.actionLog.create({
        data: {
          issueId: issue.id,
          actorId: auth.user.id,
          action: "REASSIGN_AGENCY",
          fromStatus: issue.status,
          toStatus: issue.status,
          note: auditNote,
        },
      });

      return { issue: updatedIssue, actionLog };
    });

    return NextResponse.json(
      {
        success: true,
        issue: result.issue,
        actionLog: result.actionLog,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/issues/[id]/reassign failed:", error);
    const safe = formatSafeApiError(error);
    return apiError(safe.status, safe.code, safe.message);
  }
}
