import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Category, type Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const wardParam = url.searchParams.get('ward') || url.searchParams.get('wardId');
    const categoryParam = url.searchParams.get('category'); // optional category filter
    const rawLimit = Number(url.searchParams.get('limit') || 100);
    const rawOffset = Number(url.searchParams.get('offset') || 0);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(250, Math.floor(rawLimit))) : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;

    // 1. Resolve target ward from DB (prefer exact id/code on active GBA wards)
    type WardRecord = Awaited<ReturnType<typeof prisma.ward.findFirst<{ include: { corporation: true } }>>>;
    let targetWard: WardRecord = null;

    if (wardParam) {
      targetWard = await prisma.ward.findFirst({
        where: {
          OR: [
            { id: { equals: wardParam, mode: 'insensitive' } },
            { code: { equals: wardParam, mode: 'insensitive' } },
            { officialId: { equals: wardParam, mode: 'insensitive' } },
          ],
        },
        include: { corporation: true },
      });

      if (!targetWard) {
        targetWard = await prisma.ward.findFirst({
          where: {
            OR: [
              { code: { equals: `WARD-${wardParam}`, mode: 'insensitive' } },
              { code: { equals: `WARD-${wardParam.replace(/^ward-?/i, '')}`, mode: 'insensitive' } },
            ],
          },
          include: { corporation: true },
        });
      }
    }

    // Default to first active GBA ward if not found or not specified
    if (!targetWard) {
      targetWard = await prisma.ward.findFirst({
        where: { isLegacy: false, isOperationalArea: false },
        include: { corporation: true },
        orderBy: [{ wardNumber: 'asc' }, { code: 'asc' }],
      });
      if (!targetWard) {
        targetWard = await prisma.ward.findFirst({
          include: { corporation: true },
          orderBy: { code: 'asc' },
        });
      }
    }

    if (!targetWard) {
      return NextResponse.json({ error: 'Ward not found' }, { status: 404 });
    }

    // Query ward centroid, bounding box, and boundary GeoJSON via PostGIS
    const wardGeomRes = await prisma.$queryRaw<Array<{
      lat: number | null;
      lng: number | null;
      min_lat: number | null;
      min_lng: number | null;
      max_lat: number | null;
      max_lng: number | null;
      geom_json: string | null;
      has_geom: boolean;
    }>>`
      SELECT ST_Y(ST_Centroid(geom::geometry)) as lat,
             ST_X(ST_Centroid(geom::geometry)) as lng,
             ST_YMin(ST_Envelope(geom::geometry)) as min_lat,
             ST_XMin(ST_Envelope(geom::geometry)) as min_lng,
             ST_YMax(ST_Envelope(geom::geometry)) as max_lat,
             ST_XMax(ST_Envelope(geom::geometry)) as max_lng,
             ST_AsGeoJSON(geom::geometry) as geom_json,
             (geom IS NOT NULL) as has_geom
      FROM "Ward"
      WHERE id = ${targetWard.id}
      LIMIT 1;
    `;

    const geomData = wardGeomRes[0] || null;
    let boundaryGeoJson = null;
    try {
      if (geomData?.geom_json) {
        boundaryGeoJson = JSON.parse(geomData.geom_json);
      }
    } catch {
      // ignore
    }

    const hasGeometry = Boolean(geomData?.has_geom && boundaryGeoJson);
    const bbox: [[number, number], [number, number]] | null =
      hasGeometry && geomData?.min_lat != null && geomData?.min_lng != null && geomData?.max_lat != null && geomData?.max_lng != null
        ? [[geomData.min_lat, geomData.min_lng], [geomData.max_lat, geomData.max_lng]]
        : null;

    const cleanName = targetWard.name.replace(/\s*\(Demo\)/i, '').trim();
    const isPilot = Boolean(targetWard.isOperationalArea || targetWard.code.toUpperCase().includes('PILOT'));
    const codeNumber = targetWard.wardNumber != null
      ? String(targetWard.wardNumber)
      : targetWard.code.replace(/^[A-Z]+-/, '');

    // 2. Spatial + Attribute Ward Scope (PostGIS ST_Covers when ward polygon exists, plus wardId fallback)
    let baseIssueWhere: Prisma.IssueWhereInput = { wardId: targetWard.id };
    if (hasGeometry) {
      const spatialMatches = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT i.id
        FROM "Issue" i
        LEFT JOIN "Ward" w ON w.id = ${targetWard.id}
        WHERE i."wardId" = ${targetWard.id}
           OR (w.geom IS NOT NULL AND i.geom IS NOT NULL AND ST_Covers(w.geom::geometry, i.geom::geometry))
      `;
      const matchedIds = spatialMatches.map((r) => r.id);
      baseIssueWhere = matchedIds.length > 0 ? { id: { in: matchedIds } } : { id: { in: [] } };
    }

    // Query Category Breakdown for this specific Ward
    const categoryCountsRaw = await prisma.issue.groupBy({
      by: ['category'],
      where: baseIssueWhere,
      _count: { id: true },
    });

    // Standard categories list according to Civic Atlas (all 12 Prisma categories)
    const allCategories: Category[] = [
      Category.POTHOLES,
      Category.DRAINAGE,
      Category.WATERLOGGING,
      Category.STREETLIGHTS,
      Category.SIDEWALKS,
      Category.FOOTPATH,
      Category.TRAFFIC_SIGNS,
      Category.ROAD_CUT,
      Category.TREE_FALL,
      Category.GRAFFITI,
      Category.TRASH,
      Category.OTHER,
    ];

    const categoryBreakdown: Record<string, number> = {};
    allCategories.forEach((cat) => {
      categoryBreakdown[cat] = 0;
    });

    categoryCountsRaw.forEach((c) => {
      categoryBreakdown[c.category] = c._count.id;
    });

    // 3. Query Issues for this Ward (optionally filtered by Category, with bounded pagination)
    const issueWhere: Prisma.IssueWhereInput = { ...baseIssueWhere };

    if (categoryParam && categoryParam !== 'ALL') {
      const catUpper = categoryParam.toUpperCase().replace(/\s+/g, '_');
      if (Object.values(Category).includes(catUpper as Category)) {
        issueWhere.category = catUpper as Category;
      }
    }

    const isAuthority = session.user.role === 'AUTHORITY';

    const [totalMatchingCount, issues] = await Promise.all([
      prisma.issue.count({ where: issueWhere }),
      prisma.issue.findMany({
        where: issueWhere,
        include: {
          agency: { select: { id: true, code: true, name: true } },
          ...(isAuthority
            ? {
                assignments: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  include: { personnel: { select: { id: true, name: true, role: true } } },
                },
              }
            : {}),
          reports: {
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: { id: true, role: true, photoUrl: true, createdAt: true, note: true },
          },
          _count: { select: { reports: true, comments: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    // Format issues for client maps and list components
    const statusLabelMap: Record<string, string> = {
      OPEN: 'Open',
      CONFIRMED: 'Confirmed',
      ASSIGNED: 'Assigned',
      IN_PROGRESS: 'In Progress',
      CLAIMED_FIXED: 'Repair Claimed — Awaiting Verification',
      VERIFIED_FIXED: 'Verified Fixed',
      DISPUTED: 'Disputed',
      REJECTED: 'Rejected',
      REOPENED_IN_WARRANTY: 'Reopened',
    };

    const formattedIssues = issues.map((iss: any) => {
      const latestReport = iss.reports[0] || null;
      return {
        id: iss.id,
        category: iss.category ?? 'OTHER',
        title: `${(iss.category ?? 'CIVIC_ISSUE').replace(/_/g, ' ')} at ${iss.address || 'Ward location'}`,
        location: iss.address || `Ward ${codeNumber}`,
        lat: iss.lat,
        lng: iss.lng,
        latitude: iss.lat,
        longitude: iss.lng,
        status: iss.status,
        statusLabel: statusLabelMap[iss.status] || iss.status,
        priority: iss.bandOverride || iss.band,
        priorityScore: iss.priority,
        slaBreached: iss.slaBreached,
        slaDueAt: iss.slaDueAt.toISOString(),
        repairClaimedAt: iss.repairClaimedAt ? iss.repairClaimedAt.toISOString() : null,
        photoUrl: latestReport?.photoUrl || '/images/pothole-clean-evidence.jpg',
        note: latestReport?.note || null,
        reportCount: iss._count.reports,
        commentCount: iss._count.comments,
        createdAt: iss.createdAt.toISOString(),
        ...(isAuthority
          ? {
              agencyName: iss.agency?.name || null,
              contractorName: iss.contractorName || null,
              assignedPersonnel: iss.assignments?.[0]?.personnel
                ? `${iss.assignments[0].personnel.name} (${iss.assignments[0].personnel.role})`
                : null,
            }
          : {}),
      };
    });

    // 4. Query Ward-level Overall Statistics
    const allWardIssues = await prisma.issue.findMany({
      where: baseIssueWhere,
      select: {
        id: true,
        status: true,
        priority: true,
        band: true,
        slaBreached: true,
      },
    });

    const totalReported = allWardIssues.length;
    const inProgressCount = allWardIssues.filter((i) =>
      ['ASSIGNED', 'IN_PROGRESS', 'CONFIRMED'].includes(i.status)
    ).length;
    const resolvedCount = allWardIssues.filter((i) =>
      i.status === 'VERIFIED_FIXED'
    ).length;
    const criticalCount = allWardIssues.filter(
      (i) => i.band === 'CRITICAL' || i.band === 'HIGH'
    ).length;
    const slaBreachedCount = allWardIssues.filter((i) => i.slaBreached).length;

    // 5. Query Audit Tasks for this specific Ward
    const auditTasks = await prisma.auditTask.findMany({
      where: {
        issue: { wardId: targetWard.id },
        status: 'OPEN',
      },
      include: {
        issue: {
          select: {
            id: true,
            category: true,
            address: true,
            lat: true,
            lng: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const formattedAudits = auditTasks.map((t) => ({
      id: t.id,
      issueId: t.issueId,
      kind: t.kind,
      category: t.issue.category ?? 'OTHER',
      title: `${t.kind === 'CLAIM_CHECK' ? 'Repair Verification' : 'Durability Check'}: ${(t.issue.category ?? 'CIVIC_ISSUE').replace(/_/g, ' ')}`,
      location: t.issue.address || `Ward ${codeNumber}`,
      lat: t.issue.lat,
      lng: t.issue.lng,
      dueAt: t.dueAt.toISOString(),
    }));

    return NextResponse.json({
      ward: {
        id: targetWard.id,
        code: targetWard.code,
        wardNumber: isPilot ? null : codeNumber,
        wardLabel: isPilot ? 'ORR Corridor' : `Ward ${codeNumber}`,
        name: cleanName,
        fullName: isPilot ? cleanName : `Ward ${codeNumber} • ${cleanName}`,
        lat: geomData?.lat ?? (isPilot ? 12.9500 : 12.9716),
        lng: geomData?.lng ?? (isPilot ? 77.6500 : 77.5946),
        bbox,
        hasGeometry,
        boundaryGeoJson,
      },
      categoryBreakdown,
      issues: formattedIssues,
      stats: {
        totalReported,
        inProgressCount,
        resolvedCount,
        criticalCount,
        slaBreachedCount,
      },
      pagination: {
        total: totalMatchingCount,
        returned: formattedIssues.length,
        offset,
        limit,
        hasMore: offset + formattedIssues.length < totalMatchingCount,
      },
      audits: formattedAudits,
    });
  } catch (error) {
    console.error('Error fetching ward issues and stats:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve ward data' },
      { status: 500 }
    );
  }
}
