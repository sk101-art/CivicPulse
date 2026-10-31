import { apiError } from "@/lib/api/errors";
import { loadClaimGapData } from "@/lib/issues/claimGapData";
import { NextResponse } from "next/server";

/**
 * GET /api/claim-gap?days=30|90
 * Public claim-gap statistics by ward and by desk. Desks are identified by display name only.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const periodDays = searchParams.get("days") === "90" ? 90 : 30;
    const { byWard, byDesk, thresholdDate, totalClaims } = await loadClaimGapData(periodDays);

    return NextResponse.json(
      {
        periodDays,
        thresholdDate: thresholdDate.toISOString(),
        totalClaims,
        byWard,
        byDesk,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error: unknown) {
    console.error("Failed to compute claim gap:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal error computing claim gap");
  }
}
