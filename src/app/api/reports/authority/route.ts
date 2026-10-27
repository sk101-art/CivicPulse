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
  lat: coordinateSchema.shape.lat,
  lng: coordinateSchema.shape.lng,
  address: z.string().optional(),
  agencyId: z.string().optional(),
});

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
            photoUrl: "https://placehold.co/600x400/png?text=Authority+Report",
            photoSha256: "authority_filed_placeholder",
            signature: "desk_signature",
            lat,
            lng,
            gpsAccuracyM: 10.0,
            capturedAt: new Date(),
            note: description || title || "Authority observation",
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
