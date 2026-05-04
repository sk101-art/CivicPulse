import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Status } from "@prisma/client";

type SessionUser = { id?: string; name?: string; email?: string; role?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;

    if (!sessionUser || sessionUser.role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const officerName = sessionUser.name || sessionUser.email || "Unknown Officer";
    
    await prisma.$executeRaw`
      UPDATE "Report"
      SET 
        "status" = 'CONFIRMED'::"Status",
        "confirmedAt" = NOW(),
        "confirmedBy" = ${officerName}
      WHERE "id" = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Confirmation failed:", error);
    return new NextResponse(error?.message || "Internal Server Error", { status: 500 });
  }
}
