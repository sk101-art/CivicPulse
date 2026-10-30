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
  role: z.enum(["REPORT", "CONFIRM", "CLAIM_FIX", "VERIFY", "AUDIT"]),
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

      if (photoBuffer.length === 0) {
        return apiError(
          400,
          "INVALID_PHOTO",
          "Evidence photo is missing or empty"
        );
      }

      // Every report photo must be signed with role REPORT
      if (data.payload.role !== "REPORT") {
        return apiError(
          400,
          "WRONG_EVIDENCE_ROLE",
          `Report evidence must be signed with role REPORT (got ${data.payload.role})`
        );
      }

      // Check offline reporting requirements
      if (data.offline) {
        const offlineHash = crypto.createHash("sha256").update(photoBuffer).digest("hex");
        if (offlineHash !== data.payload.photoHash) {
          return apiError(
            400,
            "EVIDENCE_VERIFICATION_FAILED",
            "Evidence verification failed: PHOTO_HASH_MISMATCH"
          );
        }

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
          photoBuffer,
          "REPORT"
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
        capturedAt: new Date(data.payload.capturedAt),
        note: data.note || data.title,
        sizeClass: data.sizeClass,
        blockedShare: data.blockedShare,
        offline: data.offline === true,
      });

      // Enqueue async AI job (G1 vision triage) off the request path, on the exact evidence row
      await enqueueAiJob({
        feature: "G1",
        targetId: result.report.id,
      });

      return NextResponse.json(result, { status: 201 });
    }

    // Branch 2: Direct/Test Report Schema.
    // Unsigned reports are ONLY accepted inside the automated test runner and only for raw direct reports.
    // In development and production every report must carry signed, on-site evidence (V1–V3).
    const isSignedAttempt = Boolean(
      body && typeof body === "object" && ("payload" in body || "photoBase64" in body)
    );
    const allowUnsignedTestReports =
      !isSignedAttempt && (process.env.NODE_ENV === "test" || process.env.VITEST === "true");
    const directParsed = allowUnsignedTestReports
      ? directReportSchema.safeParse(body)
      : null;
    if (directParsed && directParsed.success) {
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

    const firstIssue = signedParsed.success ? undefined : signedParsed.error?.issues?.[0];
    return apiError(
      400,
      "VALIDATION_ERROR",
      firstIssue
        ? `Invalid report: ${firstIssue.path.join(".")} ${firstIssue.message}`
        : "Invalid report payload format"
    );
  } catch (error: unknown) {
    console.error("Report ingestion failed:", error);
    const { status, code, message } = formatSafeApiError(error, "Internal server error filing report");
    return apiError(status, code, message);
  }
}

function formatLocationTitle(category: string, address?: string | null, lat?: number | null, lng?: number | null): string {
  const cat = category.replace(/_/g, " ");
  if (address && address.trim() && address.trim().toLowerCase() !== "bengaluru" && !address.toLowerCase().includes("pending")) {
    return `${cat} at ${address}`;
  }
  if (typeof lat === "number" && typeof lng === "number") {
    return `${cat} (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
  }
  return `${cat} (Coordinates attached)`;
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

      const formatted = userReports.map((r) => {
        const addr = (r.issue.address && r.issue.address.trim() && r.issue.address.toLowerCase() !== "bengaluru" && !r.issue.address.toLowerCase().includes("pending"))
          ? r.issue.address
          : `${r.lat.toFixed(4)}° N, ${r.lng.toFixed(4)}° E`;

        return {
          id: r.id,
          issueId: r.issueId,
          title: formatLocationTitle(r.issue.category, r.issue.address, r.lat, r.lng),
          category: r.issue.category,
          status: r.issue.status,
          createdAt: r.createdAt,
          address: addr,
          latitude: r.lat,
          longitude: r.lng,
          lat: r.lat,
          lng: r.lng,
          priorityScore: r.issue.priority,
          priority: r.issue.priority,
          voteCount: r.issue._count?.reports || 0,
          commentCount: r.issue._count?.comments || 0,
          isSeed: r.issue.isSeed || r.isSeed,
        };
      });

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

    const formatted = issues.map((i) => {
      const addr = (i.address && i.address.trim() && i.address.toLowerCase() !== "bengaluru" && !i.address.toLowerCase().includes("pending"))
        ? i.address
        : `${i.lat.toFixed(4)}° N, ${i.lng.toFixed(4)}° E`;

      return {
        ...i,
        address: addr,
        latitude: i.lat,
        longitude: i.lng,
        priorityScore: i.priority,
        title: formatLocationTitle(i.category, i.address, i.lat, i.lng),
        voteCount: i._count?.reports || i.reports?.length || 0,
        commentCount: i._count?.comments || 0,
        isSeed: i.isSeed,
      };
    });

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
