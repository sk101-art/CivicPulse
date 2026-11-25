import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { AssignmentStatus, Role, Status } from "@prisma/client";
import { z } from "zod";
import { TEXT_LIMITS } from "@/lib/validation/limits";

export const dynamic = "force-dynamic";

const assignSchema = z.object({
  personnelId: z.string().min(1, "Personnel ID is required"),
  note: z.string().max(TEXT_LIMITS.actionNote).optional(),
});

/**
 * POST /api/issues/[id]/assign
 * Assigns a field personnel member to an issue, recording an Assignment row
 * and an immutable ActionLog entry.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) return auth.error;

    const { id } = await params;
    const parsed = await parseJson(req, assignSchema);
    if (parsed.error) return parsed.error;

    const { personnelId, note } = parsed.data;

    const [issue, personnel] = await Promise.all([
      prisma.issue.findUnique({ where: { id } }),
      prisma.personnel.findUnique({ where: { id: personnelId } }),
    ]);

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue with ID ${id} not found`);
    }
    if (!personnel || !personnel.active) {
      return apiError(400, "INVALID_PERSONNEL", "Selected field personnel is unavailable or inactive");
    }

    const result = await prisma.$transaction(async (tx) => {
      // Replace any prior unstarted PENDING assignments on this issue
      await tx.assignment.deleteMany({
        where: { issueId: id, status: AssignmentStatus.PENDING },
      });

      const assignment = await tx.assignment.create({
        data: {
          issueId: id,
          personnelId: personnel.id,
          status: AssignmentStatus.PENDING,
        },
        include: { personnel: true },
      });

      const shouldAdvanceStatus =
        issue.status === Status.OPEN || issue.status === Status.CONFIRMED;
      const nextStatus = shouldAdvanceStatus ? Status.ASSIGNED : issue.status;

      const updatedIssue = await tx.issue.update({
        where: { id },
        data: {
          ...(shouldAdvanceStatus ? { status: Status.ASSIGNED } : {}),
        },
        include: {
          agency: { select: { id: true, code: true, name: true, slaHours: true } },
          assignments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { personnel: true },
          },
          _count: { select: { reports: true, comments: true } },
          reports: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { id: true, photoUrl: true, createdAt: true },
          },
        },
      });

      await tx.actionLog.create({
        data: {
          issueId: id,
          actorId: auth.user.id,
          action: "ASSIGN_PERSONNEL",
          fromStatus: issue.status,
          toStatus: nextStatus,
          note: note?.trim()
            ? `Assigned to ${personnel.name} (${personnel.role}): ${note.trim()}`
            : `Assigned to field personnel ${personnel.name} (${personnel.role})`,
        },
      });

      return { assignment, issue: updatedIssue };
    });

    return NextResponse.json({
      success: true,
      assignment: result.assignment,
      issue: result.issue,
    });
  } catch (error) {
    console.error("POST /api/issues/[id]/assign failed:", error);
    const safe = formatSafeApiError(error);
    return apiError(safe.status, safe.code, safe.message);
  }
}
