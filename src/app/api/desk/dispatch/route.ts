import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { AssignmentStatus, Role, Status } from "@prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const dispatchSchema = z.object({
  personnelId: z.string().min(1, "Personnel ID is required"),
  issueIds: z.array(z.string().min(1)).min(1, "At least one issue must be selected"),
});

/**
 * POST /api/desk/dispatch
 * Batch-dispatches an optimized route of issues to a field personnel member.
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) return auth.error;

    const parsed = await parseJson(req, dispatchSchema);
    if (parsed.error) return parsed.error;

    const { personnelId, issueIds } = parsed.data;

    const personnel = await prisma.personnel.findUnique({
      where: { id: personnelId },
    });

    if (!personnel || !personnel.active) {
      return apiError(400, "INVALID_PERSONNEL", "Selected field personnel is unavailable or inactive");
    }

    const issues = await prisma.issue.findMany({
      where: { id: { in: issueIds } },
    });

    if (issues.length === 0) {
      return apiError(404, "NOT_FOUND", "No matching issues found to dispatch");
    }

    const dispatchedIds = await prisma.$transaction(async (tx) => {
      const updatedIds: string[] = [];

      for (const issue of issues) {
        await tx.assignment.deleteMany({
          where: { issueId: issue.id, status: AssignmentStatus.PENDING },
        });

        await tx.assignment.create({
          data: {
            issueId: issue.id,
            personnelId: personnel.id,
            status: AssignmentStatus.PENDING,
          },
        });

        const shouldAdvance =
          issue.status === Status.OPEN || issue.status === Status.CONFIRMED;
        const nextStatus = shouldAdvance ? Status.ASSIGNED : issue.status;

        if (shouldAdvance) {
          await tx.issue.update({
            where: { id: issue.id },
            data: { status: Status.ASSIGNED },
          });
        }

        await tx.actionLog.create({
          data: {
            issueId: issue.id,
            actorId: auth.user.id,
            action: "ASSIGN_PERSONNEL",
            fromStatus: issue.status,
            toStatus: nextStatus,
            note: `Route dispatch assigned to ${personnel.name} (${personnel.role})`,
          },
        });

        updatedIds.push(issue.id);
      }

      return updatedIds;
    });

    return NextResponse.json({
      success: true,
      dispatchedCount: dispatchedIds.length,
      dispatchedIds,
      personnel: {
        id: personnel.id,
        name: personnel.name,
        role: personnel.role,
      },
    });
  } catch (error) {
    console.error("POST /api/desk/dispatch failed:", error);
    const safe = formatSafeApiError(error);
    return apiError(safe.status, safe.code, safe.message);
  }
}
