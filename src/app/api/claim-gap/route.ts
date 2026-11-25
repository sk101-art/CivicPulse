import { apiError } from "@/lib/api/errors";
import { loadClaimGapData } from "@/lib/issues/claimGapData";
import { NextResponse } from "next/server";

/**
 * GET /api/claim-gap?days=7|30|90&corporationId=...&wardId=...&agencyId=...&category=...&status=...&outcome=...&search=...
 * Claim-gap statistics and distinct issue-level ledger records.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const periodDays: 7 | 30 | 90 =
      daysParam === "7" ? 7 : daysParam === "90" ? 90 : 30;

    const data = await loadClaimGapData(periodDays, {
      corporationId: searchParams.get("corporationId") || undefined,
      wardId: searchParams.get("wardId") || undefined,
      agencyId: searchParams.get("agencyId") || undefined,
      category: searchParams.get("category") || undefined,
      status: searchParams.get("status") || undefined,
      outcome: searchParams.get("outcome") || undefined,
      search: searchParams.get("search") || undefined,
    });

    return NextResponse.json(
      {
        periodDays: data.periodDays,
        thresholdDate: data.thresholdDate.toISOString(),
        totalClaims: data.totalClaims,
        summary: data.summary,
        records: data.records,
        byWard: data.byWard,
        byDesk: data.byDesk,
        filterOptions: data.filterOptions,
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
