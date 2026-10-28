import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { Role, Band, Category, Status, Prisma } from "@prisma/client";

const BAND_PRIORITY: Record<Band, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export async function GET(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const categoryParam = searchParams.get("category");
    const agencyIdParam = searchParams.get("agencyId");
    const wardIdParam = searchParams.get("wardId");
    const slaBreachedParam = searchParams.get("slaBreached");
    const searchParam = searchParams.get("search");

    const where: Prisma.IssueWhereInput = {};

    if (statusParam && statusParam !== "ALL") {
      const statuses = statusParam.split(",").map((s) => s.trim()) as Status[];
      where.status = { in: statuses };
    }

    if (categoryParam && categoryParam !== "ALL") {
      where.category = categoryParam as Category;
    }

    if (agencyIdParam && agencyIdParam !== "ALL") {
      where.agencyId = agencyIdParam;
    }

    if (wardIdParam && wardIdParam !== "ALL") {
      where.wardId = wardIdParam;
    }

    if (slaBreachedParam === "true") {
      where.slaBreached = true;
    }

    if (searchParam && searchParam.trim()) {
      where.OR = [
        { id: { contains: searchParam.trim(), mode: "insensitive" } },
        { address: { contains: searchParam.trim(), mode: "insensitive" } },
        { piText: { contains: searchParam.trim(), mode: "insensitive" } },
      ];
    }

    const issues = await prisma.issue.findMany({
      where,
      include: {
        agency: { select: { id: true, code: true, name: true, slaHours: true } },
        _count: { select: { reports: true, comments: true } },
        reports: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, photoUrl: true, createdAt: true },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    // In-memory sort by PI Band (CRITICAL > HIGH > MEDIUM > LOW) then Priority desc
    issues.sort((a, b) => {
      const bandA = BAND_PRIORITY[a.bandOverride || a.band] || 0;
      const bandB = BAND_PRIORITY[b.bandOverride || b.band] || 0;
      if (bandB !== bandA) {
        return bandB - bandA;
      }
      return b.priority - a.priority;
    });

    return NextResponse.json(
      {
        issues,
        total: issues.length,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error: unknown) {
    console.error("Failed to fetch desk queue:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal error fetching desk queue");
  }
}
