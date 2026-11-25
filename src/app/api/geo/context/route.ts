import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface WardMetaRow {
  id: string;
  code: string;
  officialId: string | null;
  wardNumber: number | null;
  name: string;
  nameKn: string | null;
  corporationId: string | null;
  corpCode: string | null;
  corpName: string | null;
  corpShortName: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  isOperationalArea: boolean;
  lat: number | null;
  lng: number | null;
  min_lat: number | null;
  min_lng: number | null;
  max_lat: number | null;
  max_lng: number | null;
  has_geom: boolean;
  issue_count: number;
}

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

    // Fetch lightweight metadata for all 369 GBA wards + operational areas (no heavy GeoJSON polygons here)
    const [corporations, wardsWithMeta] = await Promise.all([
      prisma.corporation.findMany({
        select: {
          id: true,
          code: true,
          officialId: true,
          name: true,
          shortName: true,
          nameKn: true,
          _count: {
            select: {
              wards: { where: { isLegacy: false, isOperationalArea: false } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.$queryRaw<WardMetaRow[]>`
        SELECT w.id,
               w.code,
               w."officialId",
               w."wardNumber",
               w.name,
               w."nameKn",
               w."corporationId",
               c.code AS "corpCode",
               c.name AS "corpName",
               c."shortName" AS "corpShortName",
               w."zoneCode",
               w."zoneName",
               w."isOperationalArea",
               ST_Y(ST_Centroid(w.geom::geometry)) AS lat,
               ST_X(ST_Centroid(w.geom::geometry)) AS lng,
               ST_YMin(ST_Envelope(w.geom::geometry)) AS min_lat,
               ST_XMin(ST_Envelope(w.geom::geometry)) AS min_lng,
               ST_YMax(ST_Envelope(w.geom::geometry)) AS max_lat,
               ST_XMax(ST_Envelope(w.geom::geometry)) AS max_lng,
               (w.geom IS NOT NULL) AS has_geom,
               COUNT(i.id)::int AS issue_count
        FROM "Ward" w
        LEFT JOIN "Corporation" c ON c.id = w."corporationId"
        LEFT JOIN "Issue" i ON i."wardId" = w.id
        WHERE w."isLegacy" = false
        GROUP BY w.id, w.code, w."officialId", w."wardNumber", w.name, w."nameKn",
                 w."corporationId", c.code, c.name, c."shortName", w."zoneCode",
                 w."zoneName", w."isOperationalArea", w.geom
        ORDER BY w."isOperationalArea" DESC, c."shortName" ASC NULLS LAST, w."wardNumber" ASC NULLS LAST, w.code ASC;
      `,
    ]);

    const formattedWards = wardsWithMeta.map((w) => {
      const cleanName = w.name.replace(/\s*\(Demo\)/i, '').trim();
      const isPilot = Boolean(w.isOperationalArea || w.code.toUpperCase().includes('PILOT'));
      const wardNumStr = w.wardNumber != null ? String(w.wardNumber) : w.code.replace(/^[A-Z]+-/, '');
      const wardLabel = isPilot ? 'ORR Corridor' : `Ward ${wardNumStr}`;
      const bbox: [[number, number], [number, number]] | null =
        w.has_geom && w.min_lat != null && w.min_lng != null && w.max_lat != null && w.max_lng != null
          ? [[w.min_lat, w.min_lng], [w.max_lat, w.max_lng]]
          : null;

      return {
        id: w.id,
        code: w.code,
        officialId: w.officialId,
        wardNumber: isPilot ? null : wardNumStr,
        wardLabel,
        name: cleanName,
        nameKn: w.nameKn,
        fullName: isPilot
          ? cleanName
          : w.corpName
            ? `Ward ${wardNumStr} • ${cleanName} (${w.corpName})`
            : `Ward ${wardNumStr} • ${cleanName}`,
        isPilot,
        isOperationalArea: isPilot,
        corporationId: w.corporationId,
        corporationCode: w.corpCode,
        corporationName: w.corpName,
        corporationShortName: w.corpShortName,
        zoneCode: w.zoneCode,
        zoneName: w.zoneName,
        lat: w.lat ?? (isPilot ? 12.95 : 12.9716),
        lng: w.lng ?? (isPilot ? 77.65 : 77.5946),
        bbox,
        hasGeometry: Boolean(w.has_geom),
        boundaryGeoJson: null as GeoJSON.GeoJsonObject | null,
        issueCount: Number(w.issue_count || 0),
      };
    });

    const formattedCorporations = corporations.map((c) => ({
      id: c.id,
      code: c.code,
      officialId: c.officialId,
      name: c.name,
      shortName: c.shortName,
      nameKn: c.nameKn,
      wardCount: c._count.wards,
    }));

    const matchWard = (identifier: string | null) => {
      if (!identifier) return null;
      const lower = identifier.toLowerCase().trim();
      return (
        formattedWards.find(
          (w) => w.id.toLowerCase() === lower || w.code.toLowerCase() === lower
        ) ||
        formattedWards.find(
          (w) =>
            w.code.toLowerCase() === `ward-${lower}` ||
            w.wardNumber?.toLowerCase() === lower
        ) ||
        null
      );
    };

    // Load boundaryGeoJson ONLY for the selected ward to keep payload fast
    const attachSelectedGeometry = async (ward: (typeof formattedWards)[number] | null) => {
      if (!ward || ward.id === 'zone-all' || !ward.hasGeometry) return ward;
      try {
        const res = await prisma.$queryRaw<Array<{ geom_json: string | null }>>`
          SELECT ST_AsGeoJSON(geom::geometry) AS geom_json
          FROM "Ward"
          WHERE id = ${ward.id}
          LIMIT 1;
        `;
        if (res[0]?.geom_json) {
          return { ...ward, boundaryGeoJson: JSON.parse(res[0].geom_json) };
        }
      } catch {
        // ignore geometry parse error
      }
      return ward;
    };

    if (role === 'CITIZEN') {
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

      if (!current) {
        current =
          formattedWards.find((w) => !w.isPilot) ||
          formattedWards[0] ||
          null;
      }

      const currentWithGeom = await attachSelectedGeometry(current);

      return NextResponse.json({
        role: 'CITIZEN',
        current: currentWithGeom,
        available: formattedWards,
        corporations: formattedCorporations,
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
          assignedZone: 'Greater Bengaluru Urban Grid',
          defaultWardCode: 'ALL',
        }
      : isDeskB
        ? {
            departmentCode: 'BTP',
            departmentName: 'Bengaluru Traffic Police',
            deskTitle: 'Traffic Transit & Safety Command',
            assignedZone: 'ORR & South Traffic Division',
            defaultWardCode: 'ALL',
          }
        : {
            departmentCode: 'CIVIC',
            departmentName: 'Municipal Operations Desk',
            deskTitle: 'Joint Task Force Command',
            assignedZone: 'Greater Bengaluru Urban Grid',
            defaultWardCode: 'ALL',
          };

    let current = matchWard(requestedWard);
    if (!current) {
      if (requestedWard === 'ALL' || requestedWard === 'zone-all' || !requestedWard) {
        current = {
          id: 'zone-all',
          code: 'ALL',
          officialId: null,
          wardNumber: null,
          wardLabel: departmentInfo.assignedZone,
          name: 'All Assigned Wards',
          nameKn: null,
          fullName: `${departmentInfo.departmentCode} • All Wards`,
          isPilot: false,
          isOperationalArea: false,
          corporationId: null,
          corporationCode: null,
          corporationName: null,
          corporationShortName: null,
          zoneCode: null,
          zoneName: null,
          lat: 12.9716,
          lng: 77.5946,
          bbox: null,
          hasGeometry: false,
          boundaryGeoJson: null,
          issueCount: formattedWards.reduce((acc, w) => acc + w.issueCount, 0),
        };
      } else {
        current = formattedWards.find((w) => !w.isPilot) || formattedWards[0];
      }
    }

    const currentWithGeom = await attachSelectedGeometry(current);

    return NextResponse.json({
      role: 'AUTHORITY',
      department: departmentInfo,
      current: currentWithGeom
        ? {
            ...currentWithGeom,
            departmentCode: departmentInfo.departmentCode,
            zoneName: currentWithGeom.zoneName || departmentInfo.assignedZone,
          }
        : null,
      available: [
        {
          id: 'zone-all',
          code: 'ALL',
          officialId: null,
          wardNumber: null,
          wardLabel: departmentInfo.assignedZone,
          name: 'All Assigned Wards',
          nameKn: null,
          fullName: `${departmentInfo.assignedZone} (Full Jurisdiction)`,
          isPilot: false,
          isOperationalArea: false,
          corporationId: null,
          corporationCode: null,
          corporationName: null,
          corporationShortName: null,
          zoneCode: null,
          zoneName: null,
          lat: 12.9716,
          lng: 77.5946,
          bbox: null,
          hasGeometry: false,
          boundaryGeoJson: null,
          issueCount: formattedWards.reduce((acc, w) => acc + w.issueCount, 0),
        },
        ...formattedWards,
      ],
      corporations: formattedCorporations,
    });
  } catch (error) {
    console.error('Error fetching geographical context:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve geographical context' },
      { status: 500 }
    );
  }
}
