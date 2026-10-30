import { withAuth } from "@/lib/api/auth";
import { parseJson, coordinateSchema } from "@/lib/api/validate";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { Category, Band, EvidenceRole, Status, Role } from "@prisma/client";
import { z } from "zod";

const authorityReportSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.nativeEnum(Category).default(Category.OTHER),
  lat: z.number().optional(),
  lng: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  agencyId: z.string().optional(),
}).transform((data) => ({
  ...data,
  lat: data.lat ?? data.latitude,
  lng: data.lng ?? data.longitude,
})).pipe(
  z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.nativeEnum(Category),
    lat: coordinateSchema.shape.lat,
    lng: coordinateSchema.shape.lng,
    address: z.string().optional(),
    agencyId: z.string().optional(),
  })
);

export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const parsed = await parseJson(req, authorityReportSchema);
    if (parsed.error) {
      return parsed.error;
    }

    const { title, description, category, lat, lng, address, agencyId } = parsed.data;
    const userId = auth.user.id;

    // Default SLA is 72 hours from filing
    const slaDueAt = new Date(Date.now() + 72 * 3600 * 1000);

    const issue = await prisma.issue.create({
      data: {
        category,
        status: Status.CONFIRMED,
        lat,
        lng,
        address: address || `Authority Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        agencyId: agencyId || null,
        priority: 0.5,
        band: Band.MEDIUM,
        slaDueAt,
        isSeed: false,
        actions: {
          create: {
            actorId: userId,
            action: "AUTHORITY_FILED",
            fromStatus: null,
            toStatus: Status.CONFIRMED,
            note: description || title || "Direct authority filed issue",
          },
        },
        reports: {
          create: {
            userId,
            role: EvidenceRole.REPORT,
            photoUrl: "https://ofkshdculpzvqergntcs.supabase.co/storage/v1/object/public/evidence/demo/photo-missing.jpg",
            photoSha256: "photo_missing_authority_pin",
            signature: "desk_signature",
            lat,
            lng,
            gpsAccuracyM: 10.0,
            capturedAt: new Date(),
            note: description || title || "Desk authority observation (photo pending on-site verification)",
            isSeed: false,
          },
        },
      },
      include: {
        reports: true,
        actions: true,
      },
    });

    return NextResponse.json(issue, { status: 201 });
  } catch (error: unknown) {
    console.error("Authority report filing failed:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal server error occurred");
  }
}

export async function GET() {
  try {
    const auth = await withAuth(Role.AUTHORITY);
    if (auth.error) {
      return auth.error;
    }

    const issues = await prisma.issue.findMany({
      orderBy: { priority: "desc" },
      include: {
        reports: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        actions: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { reports: true, comments: true },
        },
      },
      take: 100,
    });

    const formatted = issues.map((i) => ({
      ...i,
      latitude: i.lat,
      longitude: i.lng,
      priorityScore: i.priority,
      title: `${i.category.replace(/_/g, " ")} at ${i.address || "Bengaluru"}`,
    }));

    return NextResponse.json(formatted, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching authority issues:", error);
    return apiError(500, "INTERNAL_ERROR", "Error fetching authority issues");
  }
}
