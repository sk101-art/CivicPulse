import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api/errors";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const issue = await prisma.issue.findUnique({
      where: { id },
    });

    if (!issue) {
      return apiError(404, "NOT_FOUND", `Issue with ID ${id} not found`);
    }

    const actionLogs = await prisma.actionLog.findMany({
      where: { issueId: id },
      orderBy: { createdAt: "asc" },
    });

    // Collect user and report IDs for enrichment
    const actorIds = Array.from(new Set(actionLogs.map((l) => l.actorId)));
    const reportIds = Array.from(
      new Set(actionLogs.map((l) => l.reportId).filter((r): r is string => Boolean(r)))
    );

    const [users, reports] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, name: true, role: true },
      }),
      reportIds.length > 0
        ? prisma.report.findMany({
            where: { id: { in: reportIds } },
            select: { id: true, photoUrl: true },
          })
        : [],
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const reportMap = new Map(reports.map((r) => [r.id, r.photoUrl]));

    const enrichedLogs = actionLogs.map((log) => {
      let actorName = "Citizen";
      if (log.actorId === "system" || log.actorId === "SYSTEM") {
        actorName = "System";
      } else {
        const user = userMap.get(log.actorId);
        if (user) {
          if (user.email === "desk-a@civicpulse.local") {
            actorName = "Desk A";
          } else if (user.email === "desk-b@civicpulse.local") {
            actorName = "Desk B";
          } else if (user.name) {
            actorName = user.name;
          } else if (user.role === "AUTHORITY") {
            actorName = "Desk Officer";
          }
        }
      }

      return {
        id: log.id,
        actorName,
        action: log.action,
        note: log.note,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        createdAt: log.createdAt.toISOString(),
        evidenceThumbnail: log.reportId ? reportMap.get(log.reportId) || null : null,
      };
    });

    return NextResponse.json({ logs: enrichedLogs }, { status: 200 });
  } catch (error: unknown) {
    console.error("Failed to fetch action logs:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal error fetching action log");
  }
}
