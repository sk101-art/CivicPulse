import { withAuth } from "@/lib/api/auth";
import { apiError, formatSafeApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { ingestReportWithSpatialMerge } from "@/lib/issues/merge";
import { enqueueAiJob } from "@/lib/jobs/aiQueue";
import { verifyEvidence } from "@/lib/evidence/verify";
import { toCanonicalJson, type EvidencePayload } from "@/lib/evidence/sign";
import * as storage from "@/lib/external/storage";
import { NextResponse } from "next/server";
import { Category, Status } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";

const evidencePayloadSchema = z.object({
  accuracy: z.number().min(0).max(30),
  capturedAt: z.string(),
  lat: z.number().min(11.5).max(14.5),
  lng: z.number().min(76.5).max(78.5),
  nonce: z.string().min(1),
  photoHash: z.string().min(1),
  role: z.enum(["REPORT", "CONFIRM", "CLAIM_FIX", "VERIFY"]),
});

const signedReportSchema = z.object({
  category: z.nativeEnum(Category),
  payload: evidencePayloadSchema,
  signature: z.string().min(1),
  photoBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  note: z.string().optional(),
  title: z.string().optional(),
  sizeClass: z.enum(["small", "medium", "large"]).optional(),
  blockedShare: z.enum(["none", "part lane", "one lane", "full"]).optional(),
  address: z.string().optional(),
  offline: z.boolean().optional(),
});

const directReportSchema = z.object({
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
}).transform((d) => ({
  ...d,
  lat: d.lat ?? d.latitude ?? 12.9716,
  lng: d.lng ?? d.longitude ?? 77.5946,
})).pipe(
  z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.nativeEnum(Category),
    lat: z.number().min(11.5).max(14.5),
    lng: z.number().min(76.5).max(78.5),
    address: z.string().optional(),
    photoUrl: z.string().url(),
    photoSha256: z.string(),
    signature: z.string(),
    gpsAccuracyM: z.number().min(0).max(30),
  })
);

export async function POST(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    // Branch 1: Signed Evidence Report (T22/T23)
    const signedParsed = signedReportSchema.safeParse(body);
    if (signedParsed.success) {
      const data = signedParsed.data;
      const photoBuffer = Buffer.from(data.photoBase64, "base64");

      // Check offline reporting requirements
      if (data.offline) {
        const capturedTime = new Date(data.payload.capturedAt).getTime();
        if (isNaN(capturedTime) || Date.now() - capturedTime > 24 * 60 * 60 * 1000) {
          return apiError(
            400,
            "OFFLINE_REPORT_EXPIRED",
            "Offline report captured more than 24 hours ago"
          );
        }

        // Verify offline signature against user's registered device key
        const deviceKeys = await prisma.deviceKey.findMany({
          where: { userId: auth.user.id, revokedAt: null },
        });

        if (deviceKeys.length === 0) {
          return apiError(
            400,
            "NO_REGISTERED_DEVICE_KEY",
            "User has no registered device keys to verify offline signature"
          );
        }

        const canonicalBuffer = Buffer.from(toCanonicalJson(data.payload), "utf8");
        const sigBuffer = Buffer.from(data.signature, "base64");
        let validOfflineSig = false;

        for (const dKey of deviceKeys) {
          try {
            const pubKey = crypto.createPublicKey({
              key: dKey.publicJwk as crypto.JsonWebKey,
              format: "jwk",
            });
            if (
              crypto.verify(
                "SHA256",
                canonicalBuffer,
                { key: pubKey, dsaEncoding: "ieee-p1363" },
                sigBuffer
              )
            ) {
              validOfflineSig = true;
              break;
            }
          } catch {
            // try next
          }
        }

        if (!validOfflineSig) {
          return apiError(400, "INVALID_SIGNATURE", "Offline signature verification failed");
        }
      } else {
        // Online verification with live nonce
        const verifyResult = await verifyEvidence(
          auth.user.id,
          data.payload as EvidencePayload,
          data.signature,
          photoBuffer
        );

        if (!verifyResult.valid) {
          return apiError(
            400,
            "EVIDENCE_VERIFICATION_FAILED",
            `Evidence verification failed: ${verifyResult.reason}`
          );
        }
      }

      // Upload evidence photo to Supabase storage
      const uploadResult = await storage.uploadEvidencePhoto({
        issueId: "report-evidence",
        reportId: crypto.randomUUID(),
        buffer: photoBuffer,
        mimeType: data.mimeType,
      });

      // Ingest with spatial merge & transactional points
      const result = await ingestReportWithSpatialMerge({
        userId: auth.user.id,
        category: data.category,
        lat: data.payload.lat,
        lng: data.payload.lng,
        address: data.address,
        photoUrl: uploadResult.url,
        photoSha256: uploadResult.photoSha256,
        signature: data.signature,
        gpsAccuracyM: data.payload.accuracy,
        note: data.note || data.title,
      });

      // Enqueue async AI job (G1 vision triage) off the request path
      await enqueueAiJob({
        feature: "G1",
        targetId: result.issue.id,
      });

      return NextResponse.json(result, { status: 201 });
    }

    // Branch 2: Direct/Test Report Schema
    const directParsed = directReportSchema.safeParse(body);
    if (directParsed.success) {
      const data = directParsed.data;

      const result = await ingestReportWithSpatialMerge({
        userId: auth.user.id,
        category: data.category,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        photoUrl: data.photoUrl,
        photoSha256: data.photoSha256,
        signature: data.signature,
        gpsAccuracyM: data.gpsAccuracyM,
        note: data.description || data.title,
      });

      await enqueueAiJob({
        feature: "G1",
        targetId: result.issue.id,
      });

      return NextResponse.json(result, { status: 201 });
    }

    return apiError(400, "VALIDATION_ERROR", "Invalid report payload format");
  } catch (error: unknown) {
    console.error("Report ingestion failed:", error);
    const { status, code, message } = formatSafeApiError(error, "Internal server error filing report");
    return apiError(status, code, message);
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
    const mineParam = searchParams.get("mine") === "true";

    if (mineParam) {
      const userReports = await prisma.report.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          issue: {
            include: {
              _count: { select: { reports: true, comments: true } },
            },
          },
        },
      });

      const formatted = userReports.map((r) => ({
        id: r.id,
        issueId: r.issueId,
        title: `${r.issue.category.replace(/_/g, " ")} at ${r.issue.address || "Bengaluru"}`,
        category: r.issue.category,
        status: r.issue.status,
        createdAt: r.createdAt,
        address: r.issue.address,
        latitude: r.lat,
        longitude: r.lng,
        lat: r.lat,
        lng: r.lng,
        priorityScore: r.issue.priority,
        priority: r.issue.priority,
        voteCount: r.issue._count?.reports || 0,
        commentCount: r.issue._count?.comments || 0,
      }));

      return NextResponse.json(
        { reports: formatted, issues: formatted },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    const validStatus =
      statusParam && Object.values(Status).includes(statusParam as Status)
        ? (statusParam as Status)
        : undefined;

    const validCategory =
      categoryParam && Object.values(Category).includes(categoryParam as Category)
        ? (categoryParam as Category)
        : undefined;

    const issues = await prisma.issue.findMany({
      where: {
        ...(validStatus && { status: validStatus }),
        ...(validCategory && { category: validCategory }),
      },
      include: {
        reports: {
          orderBy: { createdAt: "desc" },
          take: 1,
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
      voteCount: i._count?.reports || i.reports?.length || 0,
      commentCount: i._count?.comments || 0,
    }));

    return NextResponse.json(
      { issues: formatted, reports: formatted },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error: unknown) {
    console.error("Failed to fetch reports:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal server error fetching reports");
  }
}
