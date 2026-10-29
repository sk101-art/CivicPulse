import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { AuditTaskStatus } from "@prisma/client";
import { haversineDistanceM } from "@/lib/evidence/sign";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/tasks
 * Returns open blind audit tasks assigned to the citizen or open in public queue.
 *
 * CRITICAL BLINDNESS GUARANTEE:
 * Must NEVER reveal issue status, repair claims, contractor names, tender IDs,
 * or existing votes. Only coordinates, challenge bearing, nonce, and deadline.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const userLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : null;
    const userLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : null;

    const now = new Date();

    const tasks = await prisma.auditTask.findMany({
      where: {
        status: AuditTaskStatus.OPEN,
        dueAt: { gt: now },
        OR: [
          { assigneeId: auth.user.id },
          { assigneeId: null },
        ],
      },
      include: {
        issue: {
          select: {
            lat: true,
            lng: true,
            address: true,
          },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
    });

    const blindTasks = tasks.map((t) => {
      let distanceM: number | undefined;
      if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
        distanceM = Math.round(haversineDistanceM(userLat, userLng, t.issue.lat, t.issue.lng));
      }

      return {
        id: t.id,
        lat: t.issue.lat,
        lng: t.issue.lng,
        address: t.issue.address,
        challengeBearingDeg: t.challengeBearingDeg,
        challengeNonce: t.challengeNonce,
        dueAt: t.dueAt,
        status: t.status,
        distanceM,
      };
    });

    // Sort by proximity if coordinates were provided
    if (userLat !== null && userLng !== null) {
      blindTasks.sort((a, b) => (a.distanceM ?? 999999) - (b.distanceM ?? 999999));
    }

    return NextResponse.json({ tasks: blindTasks }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: unknown) {
    console.error("Failed to list audit tasks:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to retrieve audit tasks");
  }
}
