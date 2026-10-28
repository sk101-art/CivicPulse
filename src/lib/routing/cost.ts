import { Category } from "@prisma/client";

export type VehicleType = "motorcycle" | "car" | "pedestrian" | "wheelchair";

export interface IssueSummary {
  id: string;
  category: Category;
  priority: number; // 0 to 100
  priorityBand?: string;
  blockedShare?: string; // "none" | "partial" | "full"
  lat: number;
  lng: number;
  segmentId?: string | null;
}

export interface AvoidRectangle {
  southWestCorner: { latitude: number; longitude: number };
  northEastCorner: { latitude: number; longitude: number };
}

/**
 * Sensitivity matrix mapping vehicle profile and hazard category to risk weight.
 * Source: PLAN.md Appendix A.3
 */
export const VEHICLE_SENSITIVITY: Record<
  VehicleType,
  Record<Category, number>
> = {
  motorcycle: {
    POTHOLES: 1.0,
    WATERLOGGING: 1.0,
    DRAINAGE: 1.0,
    SIDEWALKS: 0.1,
    FOOTPATH: 0.1,
    STREETLIGHTS: 0.6,
    ROAD_CUT: 0.8,
    TREE_FALL: 1.0,
    TRAFFIC_SIGNS: 0.3,
    GRAFFITI: 0.1,
    TRASH: 0.1,
    OTHER: 0.1,
  },
  car: {
    POTHOLES: 0.5,
    WATERLOGGING: 0.8,
    DRAINAGE: 0.6,
    SIDEWALKS: 0.0,
    FOOTPATH: 0.0,
    STREETLIGHTS: 0.3,
    ROAD_CUT: 0.5,
    TREE_FALL: 1.0,
    TRAFFIC_SIGNS: 0.3,
    GRAFFITI: 0.0,
    TRASH: 0.0,
    OTHER: 0.0,
  },
  pedestrian: {
    POTHOLES: 0.1,
    WATERLOGGING: 0.8,
    DRAINAGE: 1.0,
    SIDEWALKS: 1.0,
    FOOTPATH: 1.0,
    STREETLIGHTS: 0.8,
    ROAD_CUT: 0.6,
    TREE_FALL: 0.8,
    TRAFFIC_SIGNS: 0.5,
    GRAFFITI: 0.2,
    TRASH: 0.2,
    OTHER: 0.2,
  },
  wheelchair: {
    POTHOLES: 0.3,
    WATERLOGGING: 1.0,
    DRAINAGE: 1.0,
    SIDEWALKS: 1.5,
    FOOTPATH: 1.5,
    STREETLIGHTS: 0.8,
    ROAD_CUT: 1.0,
    TREE_FALL: 1.0,
    TRAFFIC_SIGNS: 0.5,
    GRAFFITI: 0.3,
    TRASH: 0.3,
    OTHER: 0.3,
  },
};

/**
 * Checks whether current time in Asia/Kolkata is between 19:00 and 06:00 IST.
 * Streetlights hazard only applies during dark hours.
 */
export function isStreetlightsActiveIST(date: Date = new Date()): boolean {
  // Convert date to IST hours (UTC + 5:30)
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const istTotalMinutes = (utcHours * 60 + utcMinutes + 330) % 1440;
  const istHour = Math.floor(istTotalMinutes / 60);

  // 19:00 to 06:00 (19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5)
  return istHour >= 19 || istHour < 6;
}

/**
 * Retrieves the vehicle sensitivity factor for a category, factoring in time of day for STREETLIGHTS.
 */
export function getCategorySensitivity(
  vehicle: VehicleType,
  category: Category,
  date: Date = new Date()
): number {
  if (category === Category.STREETLIGHTS) {
    if (!isStreetlightsActiveIST(date)) {
      return 0.0;
    }
  }

  const vehicleMap = VEHICLE_SENSITIVITY[vehicle] || VEHICLE_SENSITIVITY.car;
  return vehicleMap[category] ?? 0.1;
}

/**
 * Computes hazard cost along a route:
 * hazardCost(route) = Σ over open issues on matched segments of (PI / 100) * sensitivity[vehicle][category]
 */
export function calculateHazardCost(
  issues: IssueSummary[],
  vehicle: VehicleType,
  date: Date = new Date()
): number {
  let cost = 0;
  for (const issue of issues) {
    const sensitivity = getCategorySensitivity(vehicle, issue.category, date);
    const pi = Math.max(0, Math.min(100, issue.priority));
    cost += (pi / 100) * sensitivity;
  }
  return Math.round(cost * 1000) / 1000;
}

/**
 * Computes overall route score:
 * score(route) = travelTimeSeconds * (1 + beta * hazardCost)
 * beta range: 0.0 to 0.5, default 0.15. Lowest score wins.
 */
export function calculateRouteScore(
  travelTimeSeconds: number,
  hazardCost: number,
  beta: number = 0.15
): number {
  const clampedBeta = Math.max(0, Math.min(0.5, beta));
  const score = travelTimeSeconds * (1 + clampedBeta * hazardCost);
  return Math.round(score * 10) / 10;
}

/**
 * Generates hard avoidAreas for CRITICAL issues with blockedShare "full".
 * Padding: 30 meters bounding box.
 */
export function buildAvoidAreasForCriticalHazards(
  issues: IssueSummary[],
  paddingMeters: number = 30
): AvoidRectangle[] {
  const padDegLat = paddingMeters / 111000;
  const padDegLon = paddingMeters / (111000 * Math.cos((12.95 * Math.PI) / 180));

  const avoidAreas: AvoidRectangle[] = [];

  for (const issue of issues) {
    const isCritical =
      issue.priorityBand === "CRITICAL" || issue.priority >= 80;
    const isFullyBlocked =
      (issue.blockedShare || "").toLowerCase() === "full";

    if (isCritical && isFullyBlocked) {
      avoidAreas.push({
        southWestCorner: {
          latitude: issue.lat - padDegLat,
          longitude: issue.lng - padDegLon,
        },
        northEastCorner: {
          latitude: issue.lat + padDegLat,
          longitude: issue.lng + padDegLon,
        },
      });
    }
  }

  return avoidAreas;
}

export interface EvaluatedRoute {
  index: number;
  coords: Array<[number, number]>;
  distanceMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  hazardCost: number;
  routeScore: number;
  issues: IssueSummary[];
}

export interface RouteChoiceResult {
  bestRouteIndex: number;
  bestRoute: EvaluatedRoute;
  fastestRoute: EvaluatedRoute;
  explanation: string;
}

/**
 * Generates human-readable explanation of route choice:
 * e.g., "avoids 2 hazards, +3 min" or "fastest and safest path"
 */
export function generateRouteExplanation(
  bestRoute: EvaluatedRoute,
  fastestRoute: EvaluatedRoute
): string {
  const bestHazards = bestRoute.issues.length;
  const fastestHazards = fastestRoute.issues.length;
  const avoided = fastestHazards - bestHazards;

  const extraSeconds = Math.max(
    0,
    bestRoute.travelTimeSeconds - fastestRoute.travelTimeSeconds
  );
  const extraMinutes = Math.round(extraSeconds / 60);

  if (bestRoute.index === fastestRoute.index) {
    if (bestHazards === 0) {
      return "Direct path has 0 detected road hazards.";
    }
    return `Optimal route with lowest overall hazard cost (${bestHazards} minor hazard${bestHazards > 1 ? "s" : ""}).`;
  }

  if (avoided > 0) {
    const hazardText = `${avoided} hazard${avoided > 1 ? "s" : ""}`;
    if (extraMinutes > 0) {
      return `avoids ${hazardText}, +${extraMinutes} min`;
    }
    return `avoids ${hazardText}, same travel time`;
  }

  return `Safer surface condition for your vehicle profile (+${extraMinutes} min).`;
}

/**
 * Chooses the best route from evaluated alternatives based on lowest route score.
 */
export function chooseBestRoute(
  routes: EvaluatedRoute[]
): RouteChoiceResult {
  if (routes.length === 0) {
    throw new Error("No routes provided to chooseBestRoute");
  }

  // Find fastest route by travel time
  let fastest = routes[0];
  for (const r of routes) {
    if (r.travelTimeSeconds < fastest.travelTimeSeconds) {
      fastest = r;
    }
  }

  // Find best route by lowest score
  let best = routes[0];
  for (const r of routes) {
    if (r.routeScore < best.routeScore) {
      best = r;
    }
  }

  const explanation = generateRouteExplanation(best, fastest);

  return {
    bestRouteIndex: best.index,
    bestRoute: best,
    fastestRoute: fastest,
    explanation,
  };
}
