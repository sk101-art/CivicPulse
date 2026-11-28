import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { generateWardBrief } from "@/lib/ai/analyst";
import { loadAreaBriefingTelemetry, type BriefingPeriod } from "@/lib/desk/areaBriefing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const wardCode = searchParams.get("wardCode") || "ALL";
    const wardId = searchParams.get("wardId") || undefined;
    const corporationId = searchParams.get("corporationId") || undefined;
    const periodParam = (searchParams.get("period") || "30d") as BriefingPeriod;

    const telemetry = await loadAreaBriefingTelemetry({
      wardCode,
      wardId,
      corporationId,
      period: periodParam,
    });

    const brief = await generateWardBrief(telemetry.scope.wardCode, telemetry);

    return NextResponse.json(
      {
        ...brief,
        telemetry,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err: unknown) {
    console.error("Failed to generate area briefing:", err);
    return apiError(500, "INTERNAL_ERROR", "Failed to generate area briefing");
  }
}
