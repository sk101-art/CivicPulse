import { prisma } from "@/lib/db/prisma";

export interface SegmentCandidate {
  id: string;
  osmWayId: string;
  name: string | null;
  roadClass: string;
  coords: Array<[number, number]>; // Array of [lat, lng]
}

export interface MatchSegmentsOptions {
  maxDistanceM?: number; // default 10 m
  maxBearingDiffDeg?: number; // default 30°
  segments?: SegmentCandidate[]; // in-memory candidate segments (for unit tests / fixtures)
}

export interface MatchedStepDetail {
  segmentId: string;
  osmWayId: string;
  name: string | null;
  roadClass: string;
  distanceM: number;
  bearingDiffDeg: number;
  stepIndex: number;
}

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLon = (lon2 - lon1) * TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates initial forward azimuth (bearing) in degrees from point 1 to point 2.
 * Range: 0° to 360° (0 = North, 90 = East, 180 = South, 270 = West).
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = lat1 * TO_RAD;
  const φ2 = lat2 * TO_RAD;
  const Δλ = (lon2 - lon1) * TO_RAD;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (θ * TO_DEG + 360) % 360;
}

/**
 * Computes minimum angular difference between two bearings in degrees.
 * Returns value between 0° and 180°.
 */
export function bearingDifference(b1: number, b2: number): number {
  let diff = Math.abs(b1 - b2) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  return diff;
}

/**
 * Computes shortest distance from point to a polyline in meters.
 */
export function pointToPolylineDistanceM(
  point: [number, number],
  poly: Array<[number, number]>
): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) {
    return haversineDistanceM(point[0], point[1], poly[0][0], poly[0][1]);
  }

  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i];
    const B = poly[i + 1];
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - A[0]) * dx + (point[1] - A[1]) * dy) / lenSq));
    const projLat = A[0] + t * dx;
    const projLon = A[1] + t * dy;
    const d = haversineDistanceM(point[0], point[1], projLat, projLon);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Calculates average or primary bearing of a road segment geometry.
 */
export function calculateSegmentBearing(coords: Array<[number, number]>): number {
  if (coords.length < 2) return 0;
  return calculateBearing(
    coords[0][0],
    coords[0][1],
    coords[coords.length - 1][0],
    coords[coords.length - 1][1]
  );
}

/**
 * Selects road segments matching a route LineString.
 * Criteria:
 * 1. Segment within maxDistanceM (default 10 m).
 * 2. Segment bearing differs by < maxBearingDiffDeg (default 30°) from local route bearing.
 * Returns ordered array of unique segment IDs.
 */
export async function matchSegmentsToRoute(
  routeCoords: Array<[number, number]>,
  options: MatchSegmentsOptions = {}
): Promise<string[]> {
  const details = await matchSegmentsDetailed(routeCoords, options);
  const orderedIds: string[] = [];

  for (const match of details) {
    if (orderedIds.length === 0 || orderedIds[orderedIds.length - 1] !== match.segmentId) {
      orderedIds.push(match.segmentId);
    }
  }

  return orderedIds;
}

/**
 * Detailed segment matching with distance, bearing difference and step index.
 */
export async function matchSegmentsDetailed(
  routeCoords: Array<[number, number]>,
  options: MatchSegmentsOptions = {}
): Promise<MatchedStepDetail[]> {
  if (routeCoords.length < 2) return [];

  const maxDistanceM = options.maxDistanceM ?? 10;
  const maxBearingDiffDeg = options.maxBearingDiffDeg ?? 30;

  let candidates: SegmentCandidate[] = options.segments || [];

  // If candidate segments are not supplied, query PostGIS from the database
  if (!options.segments) {
    try {
      const geojsonLine = {
        type: "LineString",
        coordinates: routeCoords.map(([lat, lon]) => [lon, lat]),
      };
      const geojsonStr = JSON.stringify(geojsonLine);

      const dbRows = await prisma.$queryRaw<
        Array<{
          id: string;
          osmWayId: bigint | string;
          name: string | null;
          roadClass: string;
          geojson: string;
        }>
      >`
        SELECT s.id, s."osmWayId", s.name, s."roadClass",
               ST_AsGeoJSON(s.geom::geometry) AS geojson
        FROM "RoadSegment" s
        WHERE s.geom IS NOT NULL
          AND ST_DWithin(
                s.geom,
                ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)::geography,
                25
              );
      `;

      candidates = dbRows
        .map((row) => {
          try {
            const parsed = JSON.parse(row.geojson);
            if (parsed && Array.isArray(parsed.coordinates)) {
              const coords: Array<[number, number]> = parsed.coordinates.map(
                ([lon, lat]: [number, number]) => [lat, lon]
              );
              return {
                id: row.id,
                osmWayId: row.osmWayId.toString(),
                name: row.name,
                roadClass: row.roadClass,
                coords,
              };
            }
          } catch {
            // ignore
          }
          return null;
        })
        .filter((c): c is SegmentCandidate => c !== null);
    } catch {
      candidates = [];
    }
  }

  if (candidates.length === 0) return [];

  const matchedSteps: MatchedStepDetail[] = [];

  // Match along each route step
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const p1 = routeCoords[i];
    const p2 = routeCoords[i + 1];
    const stepBearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
    const stepMid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

    let bestMatch: {
      segment: SegmentCandidate;
      distanceM: number;
      bearingDiffDeg: number;
    } | null = null;

    for (const seg of candidates) {
      const dist = pointToPolylineDistanceM(stepMid, seg.coords);
      if (dist > maxDistanceM) continue;

      const segBearing = calculateSegmentBearing(seg.coords);
      const bDiff = bearingDifference(stepBearing, segBearing);

      if (bDiff < maxBearingDiffDeg) {
        if (!bestMatch || dist < bestMatch.distanceM) {
          bestMatch = {
            segment: seg,
            distanceM: dist,
            bearingDiffDeg: bDiff,
          };
        }
      }
    }

    if (bestMatch) {
      matchedSteps.push({
        segmentId: bestMatch.segment.id,
        osmWayId: bestMatch.segment.osmWayId,
        name: bestMatch.segment.name,
        roadClass: bestMatch.segment.roadClass,
        distanceM: Math.round(bestMatch.distanceM * 10) / 10,
        bearingDiffDeg: Math.round(bestMatch.bearingDiffDeg * 10) / 10,
        stepIndex: i,
      });
    }
  }

  return matchedSteps;
}
