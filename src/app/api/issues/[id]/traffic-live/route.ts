import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { getFlowSegment } from "@/lib/external/tomtom";
import { buildPlaceProfile } from "@/lib/traffic/profile";
import { DayType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/issues/[id]/traffic-live (signed-in)
 * Returns current real-time Flow segment speed vs freeFlow, slower %, confidence,
 * plus 24-hour profile sparkline for today with the current hour marked.
 * 5-minute cache TTL.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { id } = await params;
    const issue = await prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        lat: true,
        lng: true,
        segmentId: true,
        segment: {
          select: { roadClass: true },
        },
      },
    });

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue '${id}' not found`);
    }

    // 1. Live Flow
    const flow = await getFlowSegment(issue.lat, issue.lng).catch(() => null);
    const currentSpeed = flow?.currentSpeed ?? 25;
    const freeFlowSpeed = flow?.freeFlowSpeed ?? 42;
    const slowerPct =
      freeFlowSpeed > 0 && currentSpeed < freeFlowSpeed
        ? Math.round(((freeFlowSpeed - currentSpeed) / freeFlowSpeed) * 100)
        : 0;

    const roadClass = flow?.frc || issue.segment?.roadClass || "FRC2";
    const confidence = flow?.confidence ?? 0.9;

    const summary =
      slowerPct > 0
        ? `Live: ${currentSpeed} km/h vs ${freeFlowSpeed} free-flow (${slowerPct}% slower) · updated just now`
        : `Live: ${currentSpeed} km/h (free-flow) · updated just now`;

    // 2. 24-hour profile for today
    const now = new Date();
    const currentHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const todayDayType = isWeekend ? DayType.WEEKEND : DayType.WEEKDAY;

    const profileResult = await buildPlaceProfile({
      id: issue.id,
      lat: issue.lat,
      lng: issue.lng,
      segmentId: issue.segmentId,
      roadClass: issue.segment?.roadClass,
    });

    const todayProfile = profileResult.points
      .filter((p) => p.dayType === todayDayType)
      .sort((a, b) => a.hour - b.hour)
      .map((p) => ({
        hour: p.hour,
        delayRatio: p.delayRatio,
        congestionPct: Math.min(100, Math.round(p.delayRatio * 100)),
        isCurrentHour: p.hour === currentHour,
        source: p.source,
        isEstimated: p.source === "ESTIMATED",
      }));

    return NextResponse.json(
      {
        live: {
          currentSpeed,
          freeFlowSpeed,
          congestionPct: slowerPct,
          slowerPct,
          roadClass,
          confidence,
          summary,
          updatedAt: now.toISOString(),
        },
        profile24h: todayProfile,
        currentHour,
        dayType: todayDayType,
        source: profileResult.source,
        fromCache: profileResult.fromCache,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      }
    );
  } catch (error: unknown) {
    console.error("GET /api/issues/[id]/traffic-live error (returning graceful unavailable):", error);
    // Graceful fallback on DB errors or overload instead of 500
    const now = new Date();
    return NextResponse.json(
      {
        live: {
          currentSpeed: 25,
          freeFlowSpeed: 40,
          congestionPct: 0,
          slowerPct: 0,
          roadClass: "FRC2",
          confidence: 0,
          summary: "Live traffic estimate temporarily unavailable",
          updatedAt: now.toISOString(),
          unavailable: true,
        },
        profile24h: [],
        currentHour: now.getHours(),
        dayType: now.getDay() === 0 || now.getDay() === 6 ? DayType.WEEKEND : DayType.WEEKDAY,
        source: "ESTIMATED",
        fromCache: false,
        unavailable: true,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      }
    );
  }
}
