import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Issue, Report, Status } from "@prisma/client";
import { awardPoints } from "@/lib/points";
import { snapPointToSegment } from "@/lib/db/segments";
import { recomputeIssuePriority } from "@/lib/jobs/priorityRecompute";
import { reverseGeocode } from "@/lib/external/tomtom";

export interface IngestReportInput {
  userId: string;
  category: Category;
  lat: number;
  lng: number;
  address?: string;
  photoUrl: string;
  photoSha256: string;
  signature: string;
  gpsAccuracyM: number;
  capturedAt?: Date;
  note?: string;
  isSeed?: boolean;
  /** Reporter's size estimate: small | medium | large (feeds Severity). */
  sizeClass?: string;
  /** How much of the road is blocked: none | part lane | one lane | full (feeds Usability). */
  blockedShare?: string;
  /** Evidence captured offline without a live nonce (counts as half a report in Confidence). */
  offline?: boolean;
}

export interface IngestReportResult {
  issue: Issue;
  report: Report;
  isDuplicate: boolean;
  needsDuplicateReview: boolean;
  pointsEarned: number;
}

interface NearbyIssueRaw {
  id: string;
  category: string;
  distance_m: number;
  createdAt: Date;
}

/**
 * Evaluates duplicate proximity rules and ingests a new report:
 * 1. Open issue of same category within 25 m -> attach evidence as CONFIRM to existing Issue (0 points for merged duplicate).
 * 2. Ambiguous cases (within 25 m different category OR 25-40 m same category) -> create new Issue with needsDuplicateReview = true (+10 points).
 * 3. Otherwise -> create new Issue with needsDuplicateReview = false (+10 points).
 */
export async function ingestReportWithSpatialMerge(
  input: IngestReportInput
): Promise<IngestReportResult> {
  const {
    userId,
    category,
    lat,
    lng,
    address,
    photoUrl,
    photoSha256,
    signature,
    gpsAccuracyM = 5.0,
    capturedAt = new Date(),
    note,
    isSeed = false,
    sizeClass,
    blockedShare,
    offline = false,
  } = input;

  // Query nearby open issues within 40 metres using PostGIS ST_DWithin on geography
  const nearbyIssues = await prisma.$queryRaw<NearbyIssueRaw[]>`
    SELECT 
      id, 
      category::text, 
      "createdAt",
      ST_Distance(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
    FROM "Issue"
    WHERE 
      status NOT IN ('VERIFIED_FIXED'::"Status", 'REJECTED'::"Status")
      AND geom IS NOT NULL
      AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 40)
    ORDER BY "createdAt" DESC;
  `;

  // 1. Direct duplicate: same category within 25 metres
  const duplicateMatch = nearbyIssues.find(
    (item) => item.category === category && item.distance_m <= 25
  );

  if (duplicateMatch) {
    const result = await prisma.$transaction(async (tx) => {
      const existingIssue = await tx.issue.findUniqueOrThrow({
        where: { id: duplicateMatch.id },
      });

      const report = await tx.report.create({
        data: {
          issueId: existingIssue.id,
          userId,
          role: EvidenceRole.CONFIRM,
          photoUrl,
          photoSha256,
          signature,
          lat,
          lng,
          gpsAccuracyM,
          capturedAt,
          note,
          isSeed,
          offline,
        },
      });

      await tx.actionLog.create({
        data: {
          issueId: existingIssue.id,
          actorId: userId,
          action: "CONFIRMED",
          reportId: report.id,
          note: `Merged duplicate report within ${Math.round(duplicateMatch.distance_m)}m`,
        },
      });

      // Merged duplicate earns 0 points
      await awardPoints(tx, {
        userId,
        event: "DUPLICATE_MERGE",
        reason: "Merged duplicate report (0 points)",
      });

      return {
        issue: existingIssue,
        report,
        isDuplicate: true,
        needsDuplicateReview: false,
        pointsEarned: 0,
      };
    });

    await recomputeIssuePriority(result.issue.id).catch((err) => {
      console.error("Failed to recompute priority after duplicate merge:", err);
    });

    return result;
  }

  // 2. Ambiguous proximity:
  // - Within 25 m, but different category
  // - Between 25 m and 40 m, same category
  const diffCategoryWithin25m = nearbyIssues.find(
    (item) => item.category !== category && item.distance_m <= 25
  );

  const sameCategoryBetween25And40m = nearbyIssues.find(
    (item) => item.category === category && item.distance_m > 25 && item.distance_m <= 40
  );

  const needsDuplicateReview = Boolean(diffCategoryWithin25m || sameCategoryBetween25And40m);
  const slaDueAt = new Date(Date.now() + 72 * 3600 * 1000);

  const snapped = await snapPointToSegment(lat, lng, category, 20).catch(() => null);

  let finalAddress = address && address.trim() && !address.includes("Report Location") ? address.trim() : "";
  if (!finalAddress) {
    const geo = await reverseGeocode(lat, lng).catch(() => null);
    finalAddress = geo?.formatted || `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  const result = await prisma.$transaction(async (tx) => {
    const newIssue = await tx.issue.create({
      data: {
        category,
        status: Status.OPEN,
        lat,
        lng,
        address: finalAddress,
        segmentId: snapped?.id || null,
        slaDueAt,
        needsDuplicateReview,
        isSeed,
        ...(sizeClass ? { sizeClass } : {}),
        ...(blockedShare ? { blockedShare } : {}),
      },
    });

    const report = await tx.report.create({
      data: {
        issueId: newIssue.id,
        userId,
        role: EvidenceRole.REPORT,
        photoUrl,
        photoSha256,
        signature,
        lat,
        lng,
        gpsAccuracyM,
        capturedAt,
        note,
        isSeed,
        offline,
      },
    });

    await tx.actionLog.create({
      data: {
        issueId: newIssue.id,
        actorId: userId,
        action: "CREATED",
        toStatus: Status.OPEN,
        reportId: report.id,
        note: needsDuplicateReview
          ? "Created new issue with duplicate review flag set"
          : "Created new issue report",
      },
    });

    // New Issue earns +10 points
    const pointResult = await awardPoints(tx, {
      userId,
      event: "NEW_ISSUE",
      reason: "Filed new civic issue (+10 points)",
    });

    return {
      issue: newIssue,
      report,
      isDuplicate: false,
      needsDuplicateReview,
      pointsEarned: pointResult?.points ?? 10,
    };
  });

  await recomputeIssuePriority(result.issue.id).catch((err) => {
    console.error("Failed to recompute priority on new issue:", err);
  });

  return result;
}
