import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuditKind, AuditTaskStatus, EvidenceRole, Status } from '@prisma/client';
import crypto from 'crypto';
import { withAuth } from '@/lib/api/auth';
import { apiError } from '@/lib/api/errors';
import { prisma } from '@/lib/db/prisma';
import { accountAuditEligibility, INELIGIBLE_MESSAGES } from '@/lib/audit/rules';
import { haversineDistanceM } from '@/lib/geo/distance';
import { issueTitle, displayLocation } from '@/lib/issues/display';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusM: z.coerce.number().int().min(100).max(50000).default(2000),
  wardId: z.string().trim().optional(),
  corporationId: z.string().trim().optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.error) {
      return auth.error;
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      lat: searchParams.get('lat') ?? undefined,
      lng: searchParams.get('lng') ?? undefined,
      radiusM: searchParams.get('radiusM') ?? undefined,
      wardId: searchParams.get('wardId') || undefined,
      corporationId: searchParams.get('corporationId') || undefined,
    });

    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid nearby audit query parameters');
    }

    const { lat, lng, radiusM, wardId, corporationId } = parsed.data;
    const hasCoords = lat !== undefined && lng !== undefined;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { role: true, createdAt: true },
    });
    const eligibility = user
      ? accountAuditEligibility(user)
      : ({ eligible: false, reason: 'NOT_CITIZEN' } as const);

    // Always load user's own submissions (never blocked by location or eligibility)
    const myVotesRaw = await prisma.auditVote.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        task: {
          include: {
            issue: {
              select: {
                id: true,
                category: true,
                status: true,
                address: true,
                lat: true,
                lng: true,
                wardId: true,
                reports: {
                  where: { role: { in: [EvidenceRole.CLAIM_FIX, EvidenceRole.REPORT, EvidenceRole.AUDIT] } },
                  orderBy: { createdAt: 'desc' },
                  select: { photoUrl: true, role: true },
                },
              },
            },
          },
        },
      },
    });

    const mySubmissions = myVotesRaw.map((v) => {
      const iss = v.task.issue;
      const photo =
        iss.reports.find((r) => r.role === EvidenceRole.AUDIT)?.photoUrl ||
        iss.reports.find((r) => r.role === EvidenceRole.CLAIM_FIX)?.photoUrl ||
        iss.reports[0]?.photoUrl ||
        null;

      return {
        id: v.id,
        taskId: v.taskId,
        issueId: iss.id,
        category: iss.category,
        title: issueTitle(iss.category, iss.address, iss.lat, iss.lng),
        location: displayLocation(iss.address, iss.lat, iss.lng),
        submittedAt: v.createdAt.toISOString(),
        observed: v.observed,
        taskStatus: v.task.status,
        issueStatus: iss.status,
        weight: v.weight,
        image: photo,
      };
    });

    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          eligible: false,
          reason: eligibility.reason,
          message: INELIGIBLE_MESSAGES[eligibility.reason],
          eligibleAt: 'eligibleAt' in eligibility ? eligibility.eligibleAt ?? null : null,
          tasks: [],
          submissions: mySubmissions,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Resolve optional ward / corporation filter
    let targetWardIds: string[] | undefined;
    if (wardId && wardId !== 'ALL' && wardId !== 'zone-all') {
      const matchedWard = await prisma.ward.findFirst({
        where: {
          OR: [
            { id: { equals: wardId, mode: 'insensitive' } },
            { code: { equals: wardId, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      targetWardIds = matchedWard ? [matchedWard.id] : [wardId];
    } else if (corporationId && corporationId !== 'ALL') {
      const corpWards = await prisma.ward.findMany({
        where: { corporationId, isLegacy: false, isOperationalArea: false },
        select: { id: true },
      });
      targetWardIds = corpWards.map((w) => w.id);
    }

    // Use PostGIS ST_DWithin when searching by coordinates without an explicit ward override
    let postgisNearbyIssueIds: string[] | null = null;
    if (hasCoords && !targetWardIds) {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "Issue"
        WHERE status = 'CLAIMED_FIXED'::"Status"
          AND (
            (geom IS NOT NULL AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM}))
            OR (geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL)
          );
      `;
      postgisNearbyIssueIds = rows.map((r) => r.id);
    }

    const now = new Date();

    // Ensure every CLAIMED_FIXED issue with actual CLAIM_FIX evidence has an open public AuditTask
    // so eligible citizens can always discover and verify it in Nearby or Explore by Ward.
    const unindexedClaimed = await prisma.issue.findMany({
      where: {
        status: Status.CLAIMED_FIXED,
        reports: { some: { role: EvidenceRole.CLAIM_FIX } },
        ...(targetWardIds ? { wardId: { in: targetWardIds } } : {}),
        ...(postgisNearbyIssueIds ? { id: { in: postgisNearbyIssueIds } } : {}),
        auditTasks: {
          none: {
            kind: AuditKind.CLAIM_CHECK,
            status: AuditTaskStatus.OPEN,
            assigneeId: null,
            dueAt: { gt: now },
          },
        },
      },
      select: { id: true, isSeed: true },
      take: 25,
    });

    if (unindexedClaimed.length > 0) {
      await prisma.auditTask.createMany({
        data: unindexedClaimed.map((iss) => ({
          issueId: iss.id,
          assigneeId: null,
          kind: AuditKind.CLAIM_CHECK,
          dueAt: new Date(now.getTime() + 48 * 3600 * 1000),
          challengeBearingDeg: Math.floor(Math.random() * 360),
          challengeNonce: crypto.randomUUID(),
          status: AuditTaskStatus.OPEN,
          isSeed: iss.isSeed,
        })),
      });
    }

    const openTasks = await prisma.auditTask.findMany({
      where: {
        status: AuditTaskStatus.OPEN,
        dueAt: { gt: now },
        OR: [{ assigneeId: auth.user.id }, { assigneeId: null }],
        issue: {
          status: Status.CLAIMED_FIXED,
          reports: { some: { role: EvidenceRole.CLAIM_FIX } },
          ...(targetWardIds ? { wardId: { in: targetWardIds } } : {}),
          ...(postgisNearbyIssueIds ? { id: { in: postgisNearbyIssueIds } } : {}),
        },
      },
      include: {
        issue: {
          select: {
            id: true,
            category: true,
            status: true,
            lat: true,
            lng: true,
            address: true,
            wardId: true,
            contractorName: true,
            tenderId: true,
            repairClaimedAt: true,
            createdAt: true,
            agency: { select: { name: true, code: true } },
            reports: {
              where: { role: { in: [EvidenceRole.REPORT, EvidenceRole.CLAIM_FIX] } },
              orderBy: { createdAt: 'desc' },
              select: { userId: true, role: true, photoUrl: true, capturedAt: true, note: true, createdAt: true },
            },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });

    // Load ward & corporation metadata for matched issues
    const wardIds = Array.from(
      new Set(openTasks.map((t) => t.issue.wardId).filter((id): id is string => Boolean(id)))
    );
    const wardsList = wardIds.length
      ? await prisma.ward.findMany({
          where: { id: { in: wardIds } },
          include: { corporation: true },
        })
      : [];
    const wardById = new Map(wardsList.map((w) => [w.id, w]));

    const votedIssueIds = new Set(
      myVotesRaw
        .filter((v) => {
          const roundStart = v.task.issue ? 0 : 0;
          void roundStart;
          return true;
        })
        .map((v) => `${v.task.issueId}:${v.task.kind}`)
    );

    const seenIssues = new Set<string>();
    const availableTasks = [];

    for (const t of openTasks) {
      const iss = t.issue;
      if (seenIssues.has(iss.id)) continue;

      // Enforce independent verification: exclude original reporter
      const isReporter = iss.reports.some(
        (r) => r.role === EvidenceRole.REPORT && r.userId === auth.user.id
      );
      if (isReporter) continue;

      // Exclude tasks the user has already voted on in this round
      const roundStartMs = (iss.repairClaimedAt ?? iss.createdAt).getTime();
      const alreadyVotedThisRound = myVotesRaw.some(
        (v) =>
          v.task.issueId === iss.id &&
          v.task.kind === t.kind &&
          v.createdAt.getTime() >= roundStartMs
      );
      if (alreadyVotedThisRound || votedIssueIds.has(`${iss.id}:${t.kind}`)) continue;

      const validCoords = Number.isFinite(iss.lat) && Number.isFinite(iss.lng);
      let distanceM: number | null = null;
      if (hasCoords && validCoords) {
        distanceM = Math.round(haversineDistanceM(lat!, lng!, iss.lat, iss.lng));
        if (!targetWardIds && distanceM > radiusM) continue;
      } else if (hasCoords && !targetWardIds && !validCoords) {
        continue;
      }

      seenIssues.add(iss.id);

      const originalReport = iss.reports.find((r) => r.role === EvidenceRole.REPORT) ?? null;
      const claimFixReport = iss.reports.find((r) => r.role === EvidenceRole.CLAIM_FIX) ?? null;
      const ward = iss.wardId ? wardById.get(iss.wardId) ?? null : null;

      availableTasks.push({
        id: t.id,
        issueId: iss.id,
        category: iss.category,
        title: issueTitle(iss.category, iss.address, iss.lat, iss.lng),
        address: displayLocation(iss.address, iss.lat, iss.lng),
        lat: iss.lat,
        lng: iss.lng,
        hasValidCoordinates: validCoords,
        distanceM,
        dueAt: t.dueAt.toISOString(),
        repairClaimedAt: iss.repairClaimedAt?.toISOString() ?? null,
        status: iss.status,
        challengeBearingDeg: t.challengeBearingDeg,
        challengeNonce: t.challengeNonce,
        originalPhotoUrl: originalReport?.photoUrl ?? null,
        originalNote: originalReport?.note ?? null,
        originalReportedAt: (originalReport?.capturedAt ?? iss.createdAt).toISOString(),
        repairPhotoUrl: claimFixReport?.photoUrl ?? null,
        repairNote: claimFixReport?.note ?? null,
        agencyName: iss.agency?.name ?? null,
        contractorName: iss.contractorName ?? null,
        tenderId: iss.tenderId ?? null,
        ward: ward
          ? {
              id: ward.id,
              code: ward.code,
              wardNumber: ward.wardNumber,
              name: ward.name,
              corporationName: ward.corporation?.name ?? null,
            }
          : null,
      });
    }

    if (hasCoords) {
      availableTasks.sort((a, b) => (a.distanceM ?? 9999999) - (b.distanceM ?? 9999999));
    }

    return NextResponse.json(
      {
        eligible: true,
        tasks: availableTasks,
        submissions: mySubmissions,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Failed to list nearby repair verification tasks:', error);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to retrieve nearby repair verification tasks');
  }
}
