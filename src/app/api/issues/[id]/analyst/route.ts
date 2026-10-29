import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { assessIssue } from "@/lib/ai/analyst";

export const dynamic = "force-dynamic";

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
    const assessment = await assessIssue(id);

    return NextResponse.json(assessment, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: unknown) {
    console.error("Issue analyst assessment failed:", err);
    return apiError(500, "INTERNAL_ERROR", "Failed to assess issue");
  }
}
