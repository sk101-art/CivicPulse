import { prisma } from "@/lib/db/prisma";
import { Category } from "@prisma/client";

export interface SnappedSegment {
  id: string;
  osmWayId: string;
  name: string | null;
  roadClass: string;
  lanes: number | null;
  distanceM: number;
}

const PEDESTRIAN_CLASSES = new Set([
  "footway",
  "pedestrian",
  "steps",
  "path",
  "cycleway",
]);

/**
 * Checks whether a given roadClass suits the incident category.
 * Sidewalk and footpath issues can snap to footways or normal roads.
 * Vehicular categories (potholes, waterlogging, etc.) should snap to driveable roads.
 */
export function suitsCategory(roadClass: string, category?: Category): boolean {
  if (!category) return true;
  const isPedestrianIncident =
    category === Category.SIDEWALKS || category === Category.FOOTPATH;
  const isPedestrianWay = PEDESTRIAN_CLASSES.has(roadClass.toLowerCase());

  if (isPedestrianIncident) {
    return true; // Sidewalk issues can snap to footways or standard streets
  }

  // Vehicular or infrastructure issues should not snap to a footway if possible
  return !isPedestrianWay;
}

/**
 * Snaps a GPS coordinate (lat, lng) to the nearest matching RoadSegment within maxDistanceM (default 20 m).
 */
export async function snapPointToSegment(
  lat: number,
  lng: number,
  category?: Category,
  maxDistanceM: number = 20
): Promise<SnappedSegment | null> {
  // Query candidate segments within maxDistanceM using PostGIS ST_DWithin on geography
  const candidates = await prisma.$queryRaw<
    Array<{
      id: string;
      osmWayId: bigint | string;
      name: string | null;
      roadClass: string;
      lanes: number | null;
      distance_m: number;
    }>
  >`
    SELECT id, "osmWayId", name, "roadClass", lanes,
           ST_Distance(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
    FROM "RoadSegment"
    WHERE geom IS NOT NULL
      AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${maxDistanceM})
    ORDER BY distance_m ASC
    LIMIT 10;
  `;

  if (!candidates || candidates.length === 0) {
    return null;
  }

  // 1. Try to find the closest segment that suits the category
  const suitable = candidates.find((c) => suitsCategory(c.roadClass, category));
  const matched = suitable || candidates[0];

  return {
    id: matched.id,
    osmWayId: matched.osmWayId.toString(),
    name: matched.name,
    roadClass: matched.roadClass,
    lanes: matched.lanes,
    distanceM: Math.round(matched.distance_m * 10) / 10,
  };
}

/**
 * Count total imported road segments.
 */
export async function countSegments(): Promise<number> {
  return prisma.roadSegment.count();
}
