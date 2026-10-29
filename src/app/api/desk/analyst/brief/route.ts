import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { generateWardBrief } from "@/lib/ai/analyst";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const wardCode = searchParams.get("wardCode") || "150";

    const brief = await generateWardBrief(wardCode);

    return NextResponse.json(brief, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err: unknown) {
    console.error("Failed to generate ward brief:", err);
    return apiError(500, "INTERNAL_ERROR", "Failed to generate ward brief");
  }
}
