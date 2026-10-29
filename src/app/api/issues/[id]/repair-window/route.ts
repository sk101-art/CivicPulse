import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { getRepairWindowForIssue } from "@/lib/traffic/repairWindow";

export const dynamic = "force-dynamic";

/**
 * GET /api/issues/[id]/repair-window (desk only)
 * Computes 168-hour traffic profile from samples (or road-class fallback with peaks 8-11 & 17-21 IST).
 * Excludes hours on days with forecast rain >= 5.0 mm.
 * Returns the best 3 two-hour windows in next 7 days with congestion and live/estimated data basis.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;
    const result = await getRepairWindowForIssue(id);

    if (!result) {
      return apiError(404, "NOT_FOUND", `Issue '${id}' not found`);
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: unknown) {
    console.error("Failed to calculate repair window:", error);
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to calculate recommended repair window"
    );
  }
}
