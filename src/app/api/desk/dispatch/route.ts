import { withAuth } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/validate";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { AssignmentStatus, Role, Status } from "@prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NON_DISPATCHABLE_STATUSES = new Set<Status>([
  Status.VERIFIED_FIXED,
  Status.REJECTED,
  Status.CLAIMED_FIXED,
]);

const dispatchSchema = z.object({
  personnelId: z.string().min(1, "Personnel ID is required"),
  issueIds: z.array(z.string().min(1)).min(1, "At least one issue must be selected"),
  routeName: z.string().max(120).optional(),
  vehicle: z.string().max(40).optional(),
  startLocation: z
    .object({
      label: z.string().max(120),
      lat: z.number().finite(),
      lng: z.number().finite(),
    })
    .optional(),
  totalDistanceM: z.number().nonnegative().optional().nullable(),
  totalDurationS: z.number().nonnegative().optional().nullable(),
  routeSource: z.enum(["TOMTOM_ROAD", "STRAIGHT_LINE_FALLBACK"]).optional(),
});

/**
 * GET /api/desk/dispatch
 * Returns recent confirmed dispatch route plans from SavedRoute.
 */
export async function GET() {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) return auth.error;

    const routes = await prisma.savedRoute.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    return NextResponse.json(
      { routes },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("GET /api/desk/dispatch failed:", error);
    const safe = formatSafeApiError(error);
    return apiError(safe.status, safe.code, safe.message);
  }
}

/**
 * POST /api/desk/dispatch
 * Batch-dispatches an optimized route of eligible issues to an active field personnel member,
 * preserving prior assignment history and persisting a SavedRoute dispatch record.
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) return auth.error;

    const parsed = await parseJson(req, dispatchSchema);
    if (parsed.error) return parsed.error;

    const {
      personnelId,
      issueIds,
      routeName,
      vehicle,
      startLocation,
      totalDistanceM,
      totalDurationS,
      routeSource,
    } = parsed.data;

    // Deduplicate while preserving stop order
    const orderedIds = Array.from(new Set(issueIds));

    const personnel = await prisma.personnel.findUnique({
      where: { id: personnelId },
    });

    if (!personnel || !personnel.active) {
      return apiError(400, "INVALID_PERSONNEL", "Selected field personnel is unavailable or inactive");
    }

    const issues = await prisma.issue.findMany({
      where: { id: { in: orderedIds } },
    });

    if (issues.length !== orderedIds.length) {
      return apiError(404, "NOT_FOUND", "One or more selected work orders could not be found");
    }

    const ineligible = issues.filter((i) => NON_DISPATCHABLE_STATUSES.has(i.status));
    if (ineligible.length > 0) {
      return apiError(
        400,
        "INELIGIBLE_WORK_ORDER",
        `Work order(s) cannot be dispatched in status: ${ineligible.map((i) => i.status).join(", ")}`
      );
    }

    const issueById = new Map(issues.map((i) => [i.id, i]));
    const now = new Date();

    const { dispatchedIds, savedRoute } = await prisma.$transaction(async (tx) => {
      const updatedIds: string[] = [];

      for (let idx = 0; idx < orderedIds.length; idx++) {
        const issue = issueById.get(orderedIds[idx])!;

        await tx.assignment.updateMany({
          where: {
            issueId: issue.id,
            status: { in: [AssignmentStatus.PENDING, AssignmentStatus.IN_PROGRESS] },
          },
          data: { status: AssignmentStatus.COMPLETED, completedAt: now },
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
            note: `Route dispatch (Stop #${idx + 1} of ${orderedIds.length}) assigned to ${personnel.name} (${personnel.role})`,
          },
        });

        updatedIds.push(issue.id);
      }

      const routeRecord = await tx.savedRoute.create({
        data: {
          userId: auth.user.id,
          name:
            routeName?.trim() ||
            `${personnel.name} · ${orderedIds.length} stop${orderedIds.length === 1 ? "" : "s"}`,
          vehicle: vehicle || "car",
          geomJson: {
            status: "CONFIRMED_DISPATCH",
            personnelId: personnel.id,
            personnelName: personnel.name,
            personnelRole: personnel.role,
            stopIssueIds: orderedIds,
            startLocation: startLocation ?? null,
            totalDistanceM: totalDistanceM ?? null,
            totalDurationS: totalDurationS ?? null,
            routeSource: routeSource ?? "STRAIGHT_LINE_FALLBACK",
            confirmedAt: now.toISOString(),
            confirmedBy: auth.user.email || auth.user.id,
          },
        },
      });

      return { dispatchedIds: updatedIds, savedRoute: routeRecord };
    });

    return NextResponse.json({
      success: true,
      dispatchedCount: dispatchedIds.length,
      dispatchedIds,
      savedRoute,
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
