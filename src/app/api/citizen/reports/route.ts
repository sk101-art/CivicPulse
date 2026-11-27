import { NextResponse } from "next/server";
import { z } from "zod";
import { Category, EvidenceRole, Prisma, Role, Status } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { displayLocation, issueTitle } from "@/lib/issues/display";
import { formatDateIST } from "@/lib/time/ist";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.union([z.literal("ALL"), z.nativeEnum(Status)]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

/**
 * GET /api/citizen/reports
 * Returns paginated, deduplicated-by-issue report history for the authenticated citizen.
 * Includes EvidenceRole.REPORT and EvidenceRole.CONFIRM, matching loadCitizenOverview.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth(Role.CITIZEN);
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Invalid report history query parameters.");
    }

    const { q, status, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const matchingCategories = q
      ? Object.values(Category).filter((c) =>
          c.replace(/_/g, " ").toLowerCase().includes(q.toLowerCase())
        )
      : [];

    const where: Prisma.IssueWhereInput = {
      reports: {
        some: {
          userId: auth.user.id,
          role: { in: [EvidenceRole.REPORT, EvidenceRole.CONFIRM] },
        },
      },
      ...(status !== "ALL" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { address: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
              {
                reports: {
                  some: {
                    userId: auth.user.id,
                    role: { in: [EvidenceRole.REPORT, EvidenceRole.CONFIRM] },
                    note: { contains: q, mode: "insensitive" },
                  },
                },
              },
              ...(matchingCategories.length > 0
                ? [{ category: { in: matchingCategories } }]
                : []),
            ],
          }
        : {}),
    };

    const [total, issues] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          category: true,
          status: true,
          address: true,
          lat: true,
          lng: true,
          createdAt: true,
          reports: {
            where: {
              userId: auth.user.id,
              role: { in: [EvidenceRole.REPORT, EvidenceRole.CONFIRM] },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              role: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const items = issues.map((iss) => {
      const latestReport = iss.reports[0] ?? null;
      const reportedAt = latestReport?.createdAt ?? iss.createdAt;
      return {
        id: latestReport?.id ?? iss.id,
        issueId: iss.id,
        category: iss.category,
        title: issueTitle(iss.category, iss.address, iss.lat, iss.lng),
        location: displayLocation(iss.address, iss.lat, iss.lng),
        status: iss.status,
        createdAt: reportedAt.toISOString(),
        createdAtLabel: formatDateIST(reportedAt, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
    });

    return NextResponse.json(
      {
        items,
        total,
        page,
        limit,
        hasMore: skip + items.length < total,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("GET /api/citizen/reports failed:", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to load report history.");
  }
}
