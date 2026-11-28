import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

interface ResolvedWardRow {
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
  geom_json: string | null;
  has_geom: boolean;
  issue_count: number;
}

function formatWardRow(w: ResolvedWardRow) {
  const cleanName = w.name.replace(/\s*\(Demo\)/i, '').trim();
  const isPilot = Boolean(w.isOperationalArea || w.code.toUpperCase().includes('PILOT'));
  const wardNumStr = w.wardNumber != null ? String(w.wardNumber) : w.code.replace(/^[A-Z]+-/, '');

  let boundaryGeoJson = null;
  try {
    if (w.geom_json) {
      boundaryGeoJson = JSON.parse(w.geom_json);
    }
  } catch {
    // ignore malformed GeoJSON
  }

  const hasGeometry = Boolean(w.has_geom && boundaryGeoJson);
  const bbox: [[number, number], [number, number]] | null =
    hasGeometry && w.min_lat != null && w.min_lng != null && w.max_lat != null && w.max_lng != null
      ? [[w.min_lat, w.min_lng], [w.max_lat, w.max_lng]]
      : null;

  return {
    id: w.id,
    code: w.code,
    officialId: w.officialId,
    wardNumber: isPilot ? null : wardNumStr,
    wardLabel: isPilot ? 'ORR Corridor' : `Ward ${wardNumStr}`,
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
    lat: w.lat ?? 12.9716,
    lng: w.lng ?? 77.5946,
    bbox,
    hasGeometry,
    boundaryGeoJson,
    issueCount: Number(w.issue_count || 0),
  };
}

/**
 * Resolves a validated (lat, lng) coordinate pair against actual PostGIS Ward
 * boundary polygons. Never fabricates or substitutes an approximate ward when
 * the point lies outside all mapped ward boundaries.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
        { status: 400 }
      );
    }

    const parsed = coordinatesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'INVALID_COORDINATES',
          message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.',
        },
        { status: 400 }
      );
    }

    const { lat, lng } = parsed.data;

    // 1. Exact containment check against official GBA municipal ward polygons (excluding legacy & operational corridors).
    //    Order by smallest polygon area first so overlapping geometries resolve to the most specific ward.
    const exactMatches = await prisma.$queryRaw<ResolvedWardRow[]>`
      SELECT w.id, w.code, w."officialId", w."wardNumber", w.name, w."nameKn",
             w."corporationId", c.code AS "corpCode", c.name AS "corpName", c."shortName" AS "corpShortName",
             w."zoneCode", w."zoneName", w."isOperationalArea",
             ST_Y(ST_Centroid(w.geom::geometry)) AS lat,
             ST_X(ST_Centroid(w.geom::geometry)) AS lng,
             ST_YMin(ST_Envelope(w.geom::geometry)) AS min_lat,
             ST_XMin(ST_Envelope(w.geom::geometry)) AS min_lng,
             ST_YMax(ST_Envelope(w.geom::geometry)) AS max_lat,
             ST_XMax(ST_Envelope(w.geom::geometry)) AS max_lng,
             ST_AsGeoJSON(w.geom::geometry) AS geom_json,
             (w.geom IS NOT NULL) AS has_geom,
             COUNT(i.id)::int AS issue_count
      FROM "Ward" w
      LEFT JOIN "Corporation" c ON c.id = w."corporationId"
      LEFT JOIN "Issue" i ON i."wardId" = w.id
      WHERE w.geom IS NOT NULL
        AND w."isLegacy" = false
        AND w."isOperationalArea" = false
        AND UPPER(w.code) NOT LIKE '%PILOT%'
        AND ST_Covers(w.geom::geometry, ST_SetSRID(ST_Point(${lng}, ${lat}), 4326))
      GROUP BY w.id, w.code, w."officialId", w."wardNumber", w.name, w."nameKn",
               w."corporationId", c.code, c.name, c."shortName", w."zoneCode", w."zoneName", w."isOperationalArea", w.geom
      ORDER BY ST_Area(w.geom::geometry) ASC, w.code ASC
      LIMIT 1;
    `;

    let matchedRow = exactMatches[0] ?? null;
    let boundaryMatch = false;

    // 2. Boundary proximity check (within 50m) for coordinates right on a ward border
    if (!matchedRow) {
      const boundaryMatches = await prisma.$queryRaw<ResolvedWardRow[]>`
        SELECT w.id, w.code, w."officialId", w."wardNumber", w.name, w."nameKn",
               w."corporationId", c.code AS "corpCode", c.name AS "corpName", c."shortName" AS "corpShortName",
               w."zoneCode", w."zoneName", w."isOperationalArea",
               ST_Y(ST_Centroid(w.geom::geometry)) AS lat,
               ST_X(ST_Centroid(w.geom::geometry)) AS lng,
               ST_YMin(ST_Envelope(w.geom::geometry)) AS min_lat,
               ST_XMin(ST_Envelope(w.geom::geometry)) AS min_lng,
               ST_YMax(ST_Envelope(w.geom::geometry)) AS max_lat,
               ST_XMax(ST_Envelope(w.geom::geometry)) AS max_lng,
               ST_AsGeoJSON(w.geom::geometry) AS geom_json,
               (w.geom IS NOT NULL) AS has_geom,
               COUNT(i.id)::int AS issue_count
        FROM "Ward" w
        LEFT JOIN "Corporation" c ON c.id = w."corporationId"
        LEFT JOIN "Issue" i ON i."wardId" = w.id
        WHERE w.geom IS NOT NULL
          AND w."isLegacy" = false
          AND w."isOperationalArea" = false
          AND UPPER(w.code) NOT LIKE '%PILOT%'
          AND ST_DWithin(w.geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 50)
        GROUP BY w.id, w.code, w."officialId", w."wardNumber", w.name, w."nameKn",
                 w."corporationId", c.code, c.name, c."shortName", w."zoneCode", w."zoneName", w."isOperationalArea", w.geom
        ORDER BY ST_Distance(w.geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) ASC
        LIMIT 1;
      `;
      if (boundaryMatches[0]) {
        matchedRow = boundaryMatches[0];
        boundaryMatch = true;
      }
    }

    // 3. Separately check if the point lies inside an operational/pilot area (e.g. ORR Corridor)
    const pilotMatches = await prisma.$queryRaw<Array<{ id: string; code: string; name: string }>>`
      SELECT w.id, w.code, w.name
      FROM "Ward" w
      WHERE w.geom IS NOT NULL
        AND UPPER(w.code) LIKE '%PILOT%'
        AND ST_Covers(w.geom::geometry, ST_SetSRID(ST_Point(${lng}, ${lat}), 4326))
      LIMIT 1;
    `;
    const operationalArea = pilotMatches[0]
      ? {
          id: pilotMatches[0].id,
          code: pilotMatches[0].code,
          name: pilotMatches[0].name.replace(/\s*\(Demo\)/i, '').trim(),
        }
      : null;

    if (!matchedRow) {
      const [{ count: mappedWardCount }] = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM "Ward"
        WHERE geom IS NOT NULL AND UPPER(code) NOT LIKE '%PILOT%';
      `;

      const boundariesMissing = Number(mappedWardCount || 0) === 0;
      return NextResponse.json(
        {
          matched: false,
          boundaryMatch: false,
          ward: null,
          operationalArea,
          reason: boundariesMissing ? 'WARD_BOUNDARIES_UNAVAILABLE' : 'OUTSIDE_WARD_BOUNDARIES',
          message: boundariesMissing
            ? 'Municipal ward boundary data is currently unavailable. Please choose a ward manually.'
            : 'Your current location is outside mapped municipal ward boundaries. Please choose a ward manually.',
        },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    return NextResponse.json(
      {
        matched: true,
        boundaryMatch,
        ward: formatWardRow(matchedRow),
        operationalArea,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Error resolving ward from coordinates:', error);
    return NextResponse.json(
      {
        error: 'WARD_RESOLUTION_FAILED',
        message: 'Unable to resolve municipal ward from your location right now.',
      },
      { status: 500 }
    );
  }
}
