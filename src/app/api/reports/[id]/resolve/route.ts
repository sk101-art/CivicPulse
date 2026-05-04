import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma, Status } from "@prisma/client";

type SessionUser = { id?: string; role?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;
    if (!sessionUser || sessionUser.role !== 'AUTHORITY') {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { desc, photo } = await req.json();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Update Report status
      await tx.$executeRaw`
        UPDATE "Report"
        SET 
          "status" = 'RESOLVED'::"Status",
          "resolvedAt" = NOW(),
          "resolutionDesc" = ${desc},
          "resolutionPhoto" = ${photo || null}
        WHERE "id" = ${id}
      `;

      // Fetch the updated report to get the citizenId
      const reportList = await tx.$queryRaw<{citizenId: string, title: string, id: string}[]>`SELECT "citizenId", "title", "id" FROM "Report" WHERE "id" = ${id}`;
      const report = reportList[0];

      if (report) {
        // 2. Award 100 XP to the citizen who reported
        const pointsToAdd = 100;
        await tx.citizenProfile.update({
          where: { id: report.citizenId },
          data: {
            reputation: { increment: pointsToAdd }
          }
        });

        // 3. Log the reward
        await tx.pointLog.create({
          data: {
            points: pointsToAdd,
            reason: `Issue resolved: ${report.title}`,
            citizenId: report.citizenId,
            reportId: report.id
          }
        });
      }

      return report;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Resolution failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
