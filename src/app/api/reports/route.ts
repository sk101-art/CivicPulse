import { withAuth } from "@/lib/api/auth";
import { parseJson, coordinateSchema } from "@/lib/api/validate";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { ingestReportWithSpatialMerge } from "@/lib/issues/merge";
import { enqueueAiJob } from "@/lib/jobs/aiQueue";
import { NextResponse } from "next/server";
import { Category, Role, Status } from "@prisma/client";
import { z } from "zod";

const createReportSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.nativeEnum(Category).default(Category.OTHER),
  lat: z.number().optional(),
  lng: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  photoUrl: z.string().url().default("https://placehold.co/600x400.jpg"),
  photoSha256: z.string().default("placeholder_sha256"),
  signature: z.string().default("client_signature_placeholder"),
  gpsAccuracyM: z.number().min(0).max(30).default(10),
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
    photoUrl: z.string().url(),
    photoSha256: z.string(),
    signature: z.string(),
    gpsAccuracyM: z.number().min(0).max(30),
  })
);

export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.CITIZEN);
    if (auth.error) {
      return auth.error;
    }

    const parsed = await parseJson(req, createReportSchema);
    if (parsed.error) {
      return parsed.error;
    }

    const { category, lat, lng, address, photoUrl, photoSha256, signature, gpsAccuracyM, description, title } =
      parsed.data;

    // Ingest with spatial merge & transactional points
    const result = await ingestReportWithSpatialMerge({
      userId: auth.user.id,
      category,
      lat,
      lng,
      address,
      photoUrl,
      photoSha256,
      signature,
      gpsAccuracyM,
      note: description || title,
    });

    // Enqueue async AI job (G1 vision triage) off the request path
    await enqueueAiJob({
      feature: "G1",
      targetId: result.issue.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("Report ingestion failed:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal server error filing report");
  }
}

export async function GET(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const categoryParam = searchParams.get("category");
    const statusParam = searchParams.get("status");

    const validStatus =
      statusParam && Object.values(Status).includes(statusParam as Status)
        ? (statusParam as Status)
        : undefined;

    const issues = await prisma.issue.findMany({
      where: {
        ...(categoryParam ? { category: categoryParam as Category } : {}),
        ...(validStatus ? { status: validStatus } : {}),
      },
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
      orderBy: { createdAt: "desc" },
      take: 50,
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
    console.error("Error fetching issues:", error);
    return apiError(500, "INTERNAL_ERROR", "Error fetching issues");
  }
}
