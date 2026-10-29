import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { haversineDistanceM } from "@/lib/evidence/sign";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/tasks/[id]
 * Returns details for a single blind audit task.
 *
 * CRITICAL BLINDNESS GUARANTEE:
 * Returns NO issue status, NO contractor info, NO repairClaimedAt, NO votes.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : null;
    const userLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : null;

    const task = await prisma.auditTask.findUnique({
      where: { id },
      include: {
        issue: {
          select: {
            lat: true,
            lng: true,
            address: true,
          },
        },
      },
    });

    if (!task) {
      return apiError(404, "NOT_FOUND", `Audit task '${id}' not found`);
    }

    // Citizen must be assigned to this task or task must be in public queue (assigneeId: null)
    if (task.assigneeId && task.assigneeId !== auth.user.id) {
      return apiError(403, "FORBIDDEN", "You are not assigned to this audit task");
    }

    let distanceM: number | undefined;
    if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
      distanceM = Math.round(haversineDistanceM(userLat, userLng, task.issue.lat, task.issue.lng));
    }

    const blindTask = {
      id: task.id,
      lat: task.issue.lat,
      lng: task.issue.lng,
      address: task.issue.address,
      challengeBearingDeg: task.challengeBearingDeg,
      challengeNonce: task.challengeNonce,
      dueAt: task.dueAt,
      status: task.status,
      distanceM,
    };

    return NextResponse.json(blindTask, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: unknown) {
    console.error("Failed to retrieve audit task:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to retrieve audit task");
  }
}
