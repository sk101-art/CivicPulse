import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { Status, AssignmentStatus } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { personnelId } = await req.json();
    
    if (!personnelId) {
      return new NextResponse("Personnel ID is required", { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return new NextResponse("Not Found", { status: 404 });
    if (report.status === Status.RESOLVED) {
      return new NextResponse("Cannot assign a resolved report", { status: 400 });
    }

    // Use a transaction to create assignment and update status
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          reportId: id,
          personnelId,
          status: AssignmentStatus.PENDING
        }
      });
      
      await tx.$executeRaw`
        UPDATE "Report"
        SET 
          "status" = 'ASSIGNED'::"Status",
          "assignedAt" = NOW()
        WHERE "id" = ${id}
      `;
      
      return assignment;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Assign failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
