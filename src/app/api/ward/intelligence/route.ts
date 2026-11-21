import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getWardIntelligence, type TimePeriod } from "@/lib/intelligence/wardAnalytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const wardParam = searchParams.get("ward") || searchParams.get("wardId") || "WARD-84";
    const periodParam = (searchParams.get("period") || "30d") as TimePeriod;
    const userRole = session.user.role;

    const data = await getWardIntelligence(wardParam, periodParam, userRole);

    if (!data) {
      return NextResponse.json(
        { error: `Ward "${wardParam}" not found in municipal records` },
        { status: 404 }
      );
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    console.error("Ward intelligence API failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error retrieving ward intelligence";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
