import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Category, Status } from '@prisma/client';

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

    // 1. Resolve target ward from DB
    let targetWard: any = null;

    if (wardParam) {
      const lower = wardParam.toLowerCase().trim();
      targetWard = await prisma.ward.findFirst({
        where: {
          OR: [
            { id: { equals: wardParam, mode: 'insensitive' } },
            { code: { equals: wardParam, mode: 'insensitive' } },
            { code: { equals: `WARD-${wardParam}`, mode: 'insensitive' } },
            { code: { equals: `WARD-${wardParam.replace(/^ward-?/i, '')}`, mode: 'insensitive' } },
          ],
        },
      });
    }

    // Default to WARD-12 if not found or not specified
    if (!targetWard) {
      targetWard = await prisma.ward.findFirst({
        where: { code: 'WARD-12' },
      });
      if (!targetWard) {
        targetWard = await prisma.ward.findFirst({
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
    const codeNumber = targetWard.code.replace(/^[A-Z]+-/, '');
    const isPilot = targetWard.code.toUpperCase().includes('PILOT');

    // 2. Query Category Breakdown for this specific Ward
    const categoryCountsRaw = await prisma.issue.groupBy({
      by: ['category'],
      where: { wardId: targetWard.id },
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

    // 3. Query Issues for this Ward (optionally filtered by Category)
    const issueWhere: any = { wardId: targetWard.id };

    if (categoryParam && categoryParam !== 'ALL') {
      const catUpper = categoryParam.toUpperCase().replace(/\s+/g, '_');
      if (Object.values(Category).includes(catUpper as Category)) {
        issueWhere.category = catUpper as Category;
      }
    }

    const issues = await prisma.issue.findMany({
      where: issueWhere,
      include: {
        agency: { select: { id: true, code: true, name: true } },
        reports: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, photoUrl: true, createdAt: true, note: true },
        },
        _count: { select: { reports: true, comments: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    // Format issues for client maps and list components
    const statusLabelMap: Record<string, string> = {
      OPEN: 'Reported',
      CONFIRMED: 'Confirmed',
      ASSIGNED: 'Assigned',
      IN_PROGRESS: 'In Progress',
      CLAIMED_FIXED: 'Repair Claimed',
      VERIFIED_FIXED: 'Verified Fixed',
      DISPUTED: 'Disputed',
      REJECTED: 'Rejected',
      REOPENED_IN_WARRANTY: 'Reopened',
    };

    const formattedIssues = issues.map((iss) => {
      const latestReport = iss.reports[0] || null;
      return {
        id: iss.id,
        category: iss.category,
        title: `${iss.category.replace(/_/g, ' ')} at ${iss.address || 'Ward location'}`,
        location: iss.address || `Ward ${codeNumber}`,
        lat: iss.lat,
        lng: iss.lng,
        latitude: iss.lat,
        longitude: iss.lng,
        status: iss.status,
        statusLabel: statusLabelMap[iss.status] || iss.status,
        priority: iss.band,
        priorityScore: iss.priority,
        slaBreached: iss.slaBreached,
        slaDueAt: iss.slaDueAt.toISOString(),
        photoUrl: latestReport?.photoUrl || '/images/pothole-clean-evidence.jpg',
        note: latestReport?.note || null,
        reportCount: iss._count.reports,
        commentCount: iss._count.comments,
        createdAt: iss.createdAt.toISOString(),
      };
    });

    // 4. Query Ward-level Overall Statistics
    const allWardIssues = await prisma.issue.findMany({
      where: { wardId: targetWard.id },
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
      ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(i.status)
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
      category: t.issue.category,
      title: `${t.kind === 'CLAIM_CHECK' ? 'Repair Verification' : 'Durability Check'}: ${t.issue.category.replace(/_/g, ' ')}`,
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
