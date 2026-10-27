import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { Category, Band, EvidenceRole, Status } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; role?: string } | undefined;
    if (!session || sessionUser?.role !== "AUTHORITY" || !sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized: Authority role required" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, category, latitude, longitude, address, agencyId } = body;
    const userId = sessionUser.id;

    const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
    const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: "Valid latitude and longitude are required" }, { status: 400 });
    }

    const rawCategory = (category || "OTHER").toUpperCase();
    const validCategory: Category = Object.values(Category).includes(rawCategory as Category)
      ? (rawCategory as Category)
      : Category.OTHER;

    // Default SLA is 72 hours from filing
    const slaDueAt = new Date(Date.now() + 72 * 3600 * 1000);

    const issue = await prisma.issue.create({
      data: {
        category: validCategory,
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
