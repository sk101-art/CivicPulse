import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { getRepairWindowForIssue, type RepairWindowResult } from "@/lib/traffic/repairWindow";

export const dynamic = "force-dynamic";

interface CacheEntry {
  data: RepairWindowResult;
  timestamp: number;
}

const windowCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function clearRepairWindowCache(): void {
  windowCache.clear();
}

/**
 * GET /api/issues/[id]/repair-window (desk only)
 * Computes 168-hour traffic profile from samples (or road-class fallback with peaks 8-11 & 17-21 IST).
 * Excludes hours on days with forecast rain >= 5.0 mm.
 * Returns the best 3 two-hour windows in next 7 days with congestion and live/estimated data basis.
 * Cached in-memory and via private, max-age=600 for 10 minutes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let issueId = "";
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;
    issueId = id;

    // 10-minute in-memory cache check
    const cached = windowCache.get(id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        status: 200,
        headers: { "Cache-Control": "private, max-age=600" },
      });
    }

    const result = await getRepairWindowForIssue(id, new Date(), { allowLiveOverpass: true });

    if (!result) {
      return apiError(404, "NOT_FOUND", `Issue '${id}' not found`);
    }

    windowCache.set(id, { data: result, timestamp: Date.now() });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=600" },
    });
  } catch (error: unknown) {
    console.error("Failed to calculate repair window (returning graceful unavailable):", error);
    // Gracefully catch DB errors/overload and return estimate unavailable instead of 500
    return NextResponse.json(
      {
        issueId,
        basis: "estimated",
        sampleCount: 0,
        bestWindow: null,
        windows: [],
        allSlots: [],
        displayText: "Repair window estimate temporarily unavailable.",
        unavailable: true,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=60" },
      }
    );
  }
}
