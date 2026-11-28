import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { askDeskAnalyst } from "@/lib/ai/analyst";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const body = await req.json();
    const query = typeof body?.query === "string" 
      ? body.query.trim() 
      : typeof body?.message === "string" 
      ? body.message.trim() 
      : "";

    if (!query) {
      return apiError(400, "BAD_REQUEST", "Query string is required");
    }

    const rawWardId = typeof body?.wardId === "string" ? body.wardId.trim() : "";
    const normalizedWardId =
      rawWardId && rawWardId.toLowerCase() !== "zone-all" && rawWardId.toLowerCase() !== "all"
        ? rawWardId
        : undefined;

    const result = await askDeskAnalyst(query, { wardId: normalizedWardId });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    console.error("Desk analyst chat failed:", err);
    return apiError(500, "INTERNAL_ERROR", "Failed to query desk analyst");
  }
}
