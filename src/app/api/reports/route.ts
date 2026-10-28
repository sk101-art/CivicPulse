import { withAuth } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { ingestReportWithSpatialMerge } from "@/lib/issues/merge";
import { enqueueAiJob } from "@/lib/jobs/aiQueue";
import { verifyEvidence } from "@/lib/evidence/verify";
import { toCanonicalJson, type EvidencePayload } from "@/lib/evidence/sign";
import { uploadEvidencePhoto } from "@/lib/external/storage";
import { NextResponse } from "next/server";
import { Category, Role, Status } from "@prisma/client";
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
  lat: z.number().min(11.5).max(14.5),
  lng: z.number().min(76.5).max(78.5),
  address: z.string().optional(),
  photoUrl: z.string().url().default("https://placehold.co/600x400.jpg"),
  photoSha256: z.string().default("placeholder_sha256"),
  signature: z.string().default("client_signature_placeholder"),
  gpsAccuracyM: z.number().min(0).max(30).default(10),
});

export async function POST(req: Request) {
  try {
    const auth = await withAuth(Role.CITIZEN);
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
      const uploadResult = await uploadEvidencePhoto({
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
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ issues }, { status: 200 });
  } catch (error: unknown) {
    console.error("Failed to fetch reports:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal server error fetching reports");
  }
}
