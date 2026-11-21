import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;

    const url = new URL(req.url);
    const requestedWard = url.searchParams.get('ward') || url.searchParams.get('wardId');

    // Query all wards with Centroid coordinates, Bounding Box, GeoJSON boundaries, and Issue counts
    const wardsWithGeom = await prisma.$queryRaw<Array<{
      id: string;
      code: string;
      name: string;
      lat: number | null;
      lng: number | null;
      min_lat: number | null;
      min_lng: number | null;
      max_lat: number | null;
      max_lng: number | null;
      geom_json: string | null;
      has_geom: boolean;
      issue_count: number;
    }>>`
      SELECT w.id, w.code, w.name,
             ST_Y(ST_Centroid(w.geom::geometry)) as lat,
             ST_X(ST_Centroid(w.geom::geometry)) as lng,
             ST_YMin(ST_Envelope(w.geom::geometry)) as min_lat,
             ST_XMin(ST_Envelope(w.geom::geometry)) as min_lng,
             ST_YMax(ST_Envelope(w.geom::geometry)) as max_lat,
             ST_XMax(ST_Envelope(w.geom::geometry)) as max_lng,
             ST_AsGeoJSON(w.geom::geometry) as geom_json,
             (w.geom IS NOT NULL) as has_geom,
             COUNT(i.id)::int as issue_count
      FROM "Ward" w
      LEFT JOIN "Issue" i ON i."wardId" = w.id
      GROUP BY w.id, w.code, w.name, w.geom
      ORDER BY w.code ASC;
    `;

    // Clean formatting for application
    const formattedWards = wardsWithGeom.map((w) => {
      const cleanName = w.name.replace(/\s*\(Demo\)/i, '').trim();
      const codeNumber = w.code.replace(/^[A-Z]+-/, '');
      const isPilot = w.code.toUpperCase().includes('PILOT');
      
      let boundaryGeoJson = null;
      try {
        if (w.geom_json) {
          boundaryGeoJson = JSON.parse(w.geom_json);
        }
      } catch {
        // ignore JSON parse error
      }

      const hasGeometry = Boolean(w.has_geom && boundaryGeoJson);
      const bbox: [[number, number], [number, number]] | null =
        hasGeometry && w.min_lat != null && w.min_lng != null && w.max_lat != null && w.max_lng != null
          ? [[w.min_lat, w.min_lng], [w.max_lat, w.max_lng]]
          : null;

      return {
        id: w.id,
        code: w.code,
        wardNumber: isPilot ? null : codeNumber,
        wardLabel: isPilot ? 'ORR Corridor' : `Ward ${codeNumber}`,
        name: cleanName,
        fullName: isPilot ? cleanName : `Ward ${codeNumber} • ${cleanName}`,
        isPilot,
        lat: w.lat ?? (isPilot ? 12.9500 : 12.9716),
        lng: w.lng ?? (isPilot ? 77.6500 : 77.5946),
        bbox,
        hasGeometry,
        boundaryGeoJson,
        issueCount: Number(w.issue_count || 0),
      };
    });

    // Helper to find a ward by id, code, or number
    const matchWard = (identifier: string | null) => {
      if (!identifier) return null;
      const lower = identifier.toLowerCase().trim();
      return formattedWards.find(
        (w) =>
          w.id.toLowerCase() === lower ||
          w.code.toLowerCase() === lower ||
          w.code.toLowerCase() === `ward-${lower}` ||
          w.wardNumber?.toLowerCase() === lower
      );
    };

    if (role === 'CITIZEN') {
      // Priority for current ward:
      // 1. Explicit query param (e.g. ?ward=12 or ?ward=15)
      // 2. Citizen's last reported issue ward
      // 3. Ward 12 (default central ward)
      let current = matchWard(requestedWard);

      if (!current && userId) {
        try {
          const userReport = await prisma.report.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { issue: { select: { wardId: true } } },
          });

          if (userReport?.issue?.wardId) {
            current = formattedWards.find((w) => w.id === userReport.issue.wardId) || null;
          }
        } catch {
          // ignore
        }
      }

      // Default to Ward 12 if not specified
      if (!current) {
        current = formattedWards.find((w) => w.code === 'WARD-12') || formattedWards[0];
      }

      return NextResponse.json({
        role: 'CITIZEN',
        current,
        available: formattedWards,
      });
    }

    // AUTHORITY INTERFACE
    const userEmail = session.user.email?.toLowerCase() || '';
    const isDeskA = userEmail.includes('desk-a') || userEmail.includes('bbmp') || userEmail.includes('gba');
    const isDeskB = userEmail.includes('desk-b') || userEmail.includes('traffic') || userEmail.includes('btp');

    const departmentInfo = isDeskA
      ? {
          departmentCode: 'GBA',
          departmentName: 'Greater Bengaluru Authority',
          deskTitle: 'Road Infrastructure & Drainage Operations',
          assignedZone: 'Mahadevapura & Central Zone',
          defaultWardCode: 'WARD-12',
        }
      : isDeskB
      ? {
          departmentCode: 'BTP',
          departmentName: 'Bengaluru Traffic Police',
          deskTitle: 'Traffic Transit & Safety Command',
          assignedZone: 'ORR & South Traffic Division',
          defaultWardCode: 'WARD-15',
        }
      : {
          departmentCode: 'CIVIC',
          departmentName: 'Municipal Operations Desk',
          deskTitle: 'Joint Task Force Command',
          assignedZone: 'Greater Bengaluru Urban Grid',
          defaultWardCode: 'WARD-12',
        };

    let current = matchWard(requestedWard);
    if (!current) {
      if (requestedWard === 'ALL' || requestedWard === 'zone-all') {
        current = {
          id: 'zone-all',
          code: 'ALL',
          wardNumber: null,
          wardLabel: departmentInfo.assignedZone,
          name: 'All Assigned Wards',
          fullName: `${departmentInfo.departmentCode} • All Wards`,
          isPilot: false,
          lat: 12.9500,
          lng: 77.6500,
          bbox: null,
          hasGeometry: false,
          boundaryGeoJson: null,
          issueCount: formattedWards.reduce((acc, w) => acc + w.issueCount, 0),
        };
      } else {
        current =
          formattedWards.find((w) => w.code === departmentInfo.defaultWardCode) ||
          formattedWards[0];
      }
    }

    return NextResponse.json({
      role: 'AUTHORITY',
      department: departmentInfo,
      current: {
        ...current,
        departmentCode: departmentInfo.departmentCode,
        zoneName: departmentInfo.assignedZone,
      },
      available: [
        {
          id: 'zone-all',
          code: 'ALL',
          wardNumber: null,
          wardLabel: departmentInfo.assignedZone,
          name: 'All Assigned Wards',
          fullName: `${departmentInfo.assignedZone} (Full Jurisdiction)`,
          isPilot: false,
          lat: 12.9500,
          lng: 77.6500,
          bbox: null,
          hasGeometry: false,
          boundaryGeoJson: null,
          issueCount: formattedWards.reduce((acc, w) => acc + w.issueCount, 0),
        },
        ...formattedWards,
      ],
    });
  } catch (error) {
    console.error('Error fetching geographical context:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve geographical context' },
      { status: 500 }
    );
  }
}
