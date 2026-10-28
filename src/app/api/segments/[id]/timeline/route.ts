import { NextRequest, NextResponse } from "next/server";
import { getSegmentTimeline } from "@/lib/roads/timeline";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Segment ID is required" },
        { status: 400 }
      );
    }

    const timelineData = await getSegmentTimeline(id);
    if (!timelineData) {
      return NextResponse.json(
        { error: "Road segment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(timelineData);
  } catch (err: unknown) {
    console.error("GET /api/segments/[id]/timeline error:", err);
    return NextResponse.json(
      { error: "Internal server error fetching segment timeline" },
      { status: 500 }
    );
  }
}
