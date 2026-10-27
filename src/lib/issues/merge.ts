import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Issue, Report, Status } from "@prisma/client";

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
}

export interface IngestReportResult {
  issue: Issue;
  report: Report;
  isDuplicate: boolean;
  needsDuplicateReview: boolean;
}

interface NearbyIssueRaw {
  id: string;
  category: string;
  distance_m: number;
  createdAt: Date;
}

/**
 * Evaluates duplicate proximity rules and ingests a new report:
 * 1. Open issue of same category within 25 m -> attach evidence as CONFIRM to existing Issue.
 * 2. Ambiguous cases (within 25 m different category OR 25-40 m same category) -> create new Issue with needsDuplicateReview = true.
 * 3. Otherwise -> create new Issue with needsDuplicateReview = false.
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
    gpsAccuracyM,
    capturedAt = new Date(),
    note,
    isSeed = false,
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
    const existingIssue = await prisma.issue.findUniqueOrThrow({
      where: { id: duplicateMatch.id },
    });

    const report = await prisma.report.create({
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
      },
    });

    await prisma.actionLog.create({
      data: {
        issueId: existingIssue.id,
        actorId: userId,
        action: "CONFIRMED",
        reportId: report.id,
        note: `Merged duplicate report within ${Math.round(duplicateMatch.distance_m)}m`,
      },
    });

    return {
      issue: existingIssue,
      report,
      isDuplicate: true,
      needsDuplicateReview: false,
    };
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

  const newIssue = await prisma.issue.create({
    data: {
      category,
      status: Status.OPEN,
      lat,
      lng,
      address: address || `Report Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      slaDueAt,
      needsDuplicateReview,
      isSeed,
    },
  });

  const report = await prisma.report.create({
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
    },
  });

  await prisma.actionLog.create({
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

  return {
    issue: newIssue,
    report,
    isDuplicate: false,
    needsDuplicateReview,
  };
}
