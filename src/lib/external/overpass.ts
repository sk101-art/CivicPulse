import "server-only";
import fs from "fs";
import path from "path";

export interface POIInfo {
  id: number;
  name: string;
  type: "school" | "hospital" | "market";
  distanceM: number;
  lat: number;
  lng: number;
}

export interface RoadWayInfo {
  wayId?: number;
  name?: string;
  highway?: string;
  frc?: string;
  lanes: number;
  oneway: boolean;
  width?: string;
}

export interface SurroundingsResult {
  schools: POIInfo[];
  hospitals: POIInfo[];
  markets: POIInfo[];
  nearestSchool?: POIInfo;
  nearestHospital?: POIInfo;
  nearestMarket?: POIInfo;
  road: RoadWayInfo;
  cached: boolean;
  source: "pilot_osm" | "overpass_api" | "fallback";
}

interface TileCacheEntry {
  data: SurroundingsResult;
  timestamp: number;
}

const tileCache = new Map<string, TileCacheEntry>();
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

export function clearOverpassTileCache(): void {
  tileCache.clear();
}

/**
 * Calculates haversine distance in metres between two points.
 */
export function calculateDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Parses lanes from OSM tags or infers default based on highway hierarchy.
 */
export function parseLanes(highway?: string, lanesTag?: string): number {
  if (lanesTag) {
    const parsed = parseInt(lanesTag, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 12) {
      return parsed;
    }
  }

  const hw = (highway || "").toLowerCase();
  if (hw === "motorway" || hw === "trunk") return 4;
  if (hw === "primary") return 3;
  if (hw === "secondary") return 2;
  return 2; // Default 2 lanes
}

// Lazy-loaded pilot JSON cache
let pilotOsmData: any = null;

function loadPilotOsm(): any {
  if (pilotOsmData) return pilotOsmData;
  try {
    const filePath = path.join(process.cwd(), "data", "osm", "pilot.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      pilotOsmData = JSON.parse(content);
      return pilotOsmData;
    }
  } catch (err) {
    console.warn("Failed to load data/osm/pilot.json:", err);
  }
  return null;
}

/**
 * Query surroundings (schools, hospitals, markets) within 500m and road way info.
 * Enforces 30-day tile caching (500m grid cell).
 */
export async function getSurroundingsAndRoadInfo(
  lat: number,
  lng: number,
  radiusM: number = 500
): Promise<SurroundingsResult> {
  const tileKey = `tile_${Math.floor(lat * 200)}_${Math.floor(lng * 200)}`;
  const cached = tileCache.get(tileKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const schools: POIInfo[] = [];
  const hospitals: POIInfo[] = [];
  const markets: POIInfo[] = [];
  let road: RoadWayInfo = {
    lanes: 2,
    oneway: false,
  };

  // 1. Try local pilot.json if within pilot corridor
  const isPilotBbox =
    lat >= 12.92 && lat <= 12.98 && lng >= 77.67 && lng <= 77.74;

  const pilotData = isPilotBbox ? loadPilotOsm() : null;

  if (pilotData && Array.isArray(pilotData.elements)) {
    let nearestWayDist = Infinity;

    for (const elem of pilotData.elements) {
      const elemLat = elem.lat ?? elem.center?.lat;
      const elemLon = elem.lon ?? elem.center?.lon;

      if (elemLat != null && elemLon != null) {
        const dist = calculateDistanceM(lat, lng, elemLat, elemLon);
        if (dist <= radiusM) {
          const tags = elem.tags || {};
          const name = tags.name || tags["name:en"] || "Local Facility";
          const amenity = tags.amenity?.toLowerCase();
          const shop = tags.shop?.toLowerCase();

          if (
            amenity === "school" ||
            amenity === "college" ||
            amenity === "kindergarten"
          ) {
            schools.push({
              id: elem.id,
              name,
              type: "school",
              distanceM: dist,
              lat: elemLat,
              lng: elemLon,
            });
          } else if (
            amenity === "hospital" ||
            amenity === "clinic" ||
            amenity === "doctors"
          ) {
            hospitals.push({
              id: elem.id,
              name,
              type: "hospital",
              distanceM: dist,
              lat: elemLat,
              lng: elemLon,
            });
          } else if (
            amenity === "marketplace" ||
            shop === "supermarket" ||
            shop === "mall" ||
            shop === "convenience"
          ) {
            markets.push({
              id: elem.id,
              name,
              type: "market",
              distanceM: dist,
              lat: elemLat,
              lng: elemLon,
            });
          }
        }
      }

      // Check ways for nearest road lane/oneway info
      if (elem.type === "way" && elem.tags?.highway) {
        const wayLat = elem.center?.lat ?? elem.lat;
        const wayLon = elem.center?.lon ?? elem.lon;
        if (wayLat != null && wayLon != null) {
          const dist = calculateDistanceM(lat, lng, wayLat, wayLon);
          if (dist < nearestWayDist && dist < 100) {
            nearestWayDist = dist;
            road = {
              wayId: elem.id,
              name: elem.tags.name,
              highway: elem.tags.highway,
              lanes: parseLanes(elem.tags.highway, elem.tags.lanes),
              oneway: elem.tags.oneway === "yes",
              width: elem.tags.width,
            };
          }
        }
      }
    }

    schools.sort((a, b) => a.distanceM - b.distanceM);
    hospitals.sort((a, b) => a.distanceM - b.distanceM);
    markets.sort((a, b) => a.distanceM - b.distanceM);

    const result: SurroundingsResult = {
      schools,
      hospitals,
      markets,
      nearestSchool: schools[0],
      nearestHospital: hospitals[0],
      nearestMarket: markets[0],
      road,
      cached: false,
      source: "pilot_osm",
    };

    tileCache.set(tileKey, { data: result, timestamp: Date.now() });
    return result;
  }

  // 2. Query Overpass API for coordinates outside pilot
  try {
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"~"school|hospital|clinic|marketplace"](around:${radiusM},${lat},${lng});
        way["amenity"~"school|hospital|clinic|marketplace"](around:${radiusM},${lat},${lng});
        way["highway"](around:80,${lat},${lng});
      );
      out center tags;
    `;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.elements)) {
        let nearestWayDist = Infinity;
        for (const elem of data.elements) {
          const elemLat = elem.lat ?? elem.center?.lat;
          const elemLon = elem.lon ?? elem.center?.lon;
          if (elemLat != null && elemLon != null) {
            const dist = calculateDistanceM(lat, lng, elemLat, elemLon);
            const tags = elem.tags || {};
            const name = tags.name || tags["name:en"] || "Local Facility";
            const amenity = tags.amenity?.toLowerCase();

            if (amenity === "school" || amenity === "college") {
              schools.push({
                id: elem.id,
                name,
                type: "school",
                distanceM: dist,
                lat: elemLat,
                lng: elemLon,
              });
            } else if (amenity === "hospital" || amenity === "clinic") {
              hospitals.push({
                id: elem.id,
                name,
                type: "hospital",
                distanceM: dist,
                lat: elemLat,
                lng: elemLon,
              });
            } else if (amenity === "marketplace") {
              markets.push({
                id: elem.id,
                name,
                type: "market",
                distanceM: dist,
                lat: elemLat,
                lng: elemLon,
              });
            }
          }

          if (elem.type === "way" && elem.tags?.highway) {
            const wayLat = elem.center?.lat ?? elem.lat;
            const wayLon = elem.center?.lon ?? elem.lon;
            const dist =
              wayLat != null && wayLon != null
                ? calculateDistanceM(lat, lng, wayLat, wayLon)
                : 50;

            if (dist < nearestWayDist) {
              nearestWayDist = dist;
              road = {
                wayId: elem.id,
                name: elem.tags.name,
                highway: elem.tags.highway,
                lanes: parseLanes(elem.tags.highway, elem.tags.lanes),
                oneway: elem.tags.oneway === "yes",
                width: elem.tags.width,
              };
            }
          }
        }
      }

      schools.sort((a, b) => a.distanceM - b.distanceM);
      hospitals.sort((a, b) => a.distanceM - b.distanceM);
      markets.sort((a, b) => a.distanceM - b.distanceM);

      const result: SurroundingsResult = {
        schools,
        hospitals,
        markets,
        nearestSchool: schools[0],
        nearestHospital: hospitals[0],
        nearestMarket: markets[0],
        road,
        cached: false,
        source: "overpass_api",
      };

      tileCache.set(tileKey, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch {
    // Graceful fallback on network timeout or Overpass rate limit
  }

  // 3. Fallback
  const fallbackResult: SurroundingsResult = {
    schools,
    hospitals,
    markets,
    road: {
      lanes: 2,
      oneway: false,
    },
    cached: false,
    source: "fallback",
  };

  tileCache.set(tileKey, { data: fallbackResult, timestamp: Date.now() });
  return fallbackResult;
}
