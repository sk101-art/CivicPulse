import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { listAuditTasksForUser } from "@/lib/audit/blindAudit";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit/tasks
 * Open blind audit tasks the signed-in citizen may answer (assigned to them or in the public queue).
 * The public queue follows the same eligibility rules as assignment (citizen, account ≥ 24 h, not the
 * reporter, one vote per issue); ineligible users receive no tasks and therefore no challenge nonces.
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
    const lat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : NaN;
    const lng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : NaN;
    const coords = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    const listing = await listAuditTasksForUser(auth.user.id, coords);

    return NextResponse.json(listing, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: unknown) {
    console.error("Failed to list audit tasks:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to retrieve audit tasks");
  }
}
