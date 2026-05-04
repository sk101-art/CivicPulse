import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Status } from "@prisma/client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!user || user.role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { status } = await req.json();

    if (!Object.values(Status).includes(status)) {
      return new NextResponse("Invalid Status", { status: 400 });
    }

    let query = `UPDATE "Report" SET "status" = '${status}'::"Status"`;
    
    if (status === 'CONFIRMED') query += `, "confirmedAt" = NOW()`;
    if (status === 'ASSIGNED') query += `, "assignedAt" = NOW()`;
    if (status === 'IN_PROGRESS') query += `, "startedAt" = NOW()`;
    if (status === 'RESOLVED') query += `, "resolvedAt" = NOW()`;
    if (status === 'REJECTED') query += `, "rejectedAt" = NOW()`;
    
    query += ` WHERE "id" = '${id}'`;

    await prisma.$executeRawUnsafe(query);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status update failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
