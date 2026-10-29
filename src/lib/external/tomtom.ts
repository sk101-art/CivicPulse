import "server-only";
import { env, isConfigured } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import fs from "fs";
import path from "path";

export type SupportedTravelMode =
  | "car"
  | "motorcycle"
  | "pedestrian"
  | "bicycle"
  | "wheelchair"
  | "truck"
  | "taxi"
  | "bus"
  | "van";

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export interface AvoidRectangle {
  southWestCorner: LatLngPoint;
  northEastCorner: LatLngPoint;
}

export interface CalculateRouteOptions {
  origin: LatLngPoint;
  destination: LatLngPoint;
  waypoints?: LatLngPoint[];
  travelMode?: SupportedTravelMode;
  maxAlternatives?: number;
  traffic?: boolean;
  departAt?: string;
  avoidAreas?: AvoidRectangle[];
  routeType?: "fastest" | "shortest" | "eco";
}

export interface TomTomRoute {
  coords: [number, number][]; // [lat, lng]
  distanceMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  trafficLengthMeters: number;
  noTrafficTravelTimeSeconds?: number;
  liveTrafficIncidentsTravelTimeSeconds?: number;
  departureTime?: string;
  arrivalTime?: string;
  travelMode: string;
}

export interface CalculateRouteResult {
  routes: TomTomRoute[];
  travelModeUsed: string;
  fallbackNote?: string;
  cached: boolean;
  disabled?: boolean;
  _synthetic?: boolean;
}

// India geographical bounding box: Lat 6.0° to 38.0° N, Lon 68.0° to 98.0° E
export function isLocationInIndia(point: LatLngPoint): boolean {
  return (
    point.latitude >= 6.0 &&
    point.latitude <= 38.0 &&
    point.longitude >= 68.0 &&
    point.longitude <= 98.0
  );
}

// 5-minute request cache
interface CacheEntry {
  data: CalculateRouteResult;
  timestamp: number;
}

const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Request quota tracking (20,000 / month free tier cap, 1,200 / day job cap, persisted in ApiUsage)
export const MAX_MONTHLY_QUOTA = 20000;
export const MAX_DAILY_QUOTA = 1200;
const PROVIDER_NAME = "tomtom";
const PROVIDER_DAILY_NAME = "tomtom_daily";

export async function tryIncrementDailyQuota(dateStr?: string): Promise<boolean> {
  const currentDay = dateStr || new Date().toISOString().slice(0, 10); // e.g. "2026-10-29"
  try {
    const usage = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: PROVIDER_DAILY_NAME,
          month: currentDay,
        },
      },
      select: { count: true },
    });

    if (usage && usage.count >= MAX_DAILY_QUOTA) {
      return false;
    }

    await prisma.apiUsage.upsert({
      where: {
        provider_month: {
          provider: PROVIDER_DAILY_NAME,
          month: currentDay,
        },
      },
      create: {
        provider: PROVIDER_DAILY_NAME,
        month: currentDay,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    });

    return true;
  } catch (err) {
    console.error("[tomtom] Failed to check/increment daily ApiUsage quota:", err);
    return false;
  }
}

export async function getDailyTomTomCallCount(dateStr?: string): Promise<number> {
  const currentDay = dateStr || new Date().toISOString().slice(0, 10);
  try {
    const usage = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: PROVIDER_DAILY_NAME,
          month: currentDay,
        },
      },
      select: { count: true },
    });
    return usage?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function resetDailyTomTomCallCount(dateStr?: string): Promise<void> {
  const currentDay = dateStr || new Date().toISOString().slice(0, 10);
  try {
    await prisma.apiUsage.upsert({
      where: {
        provider_month: {
          provider: PROVIDER_DAILY_NAME,
          month: currentDay,
        },
      },
      create: {
        provider: PROVIDER_DAILY_NAME,
        month: currentDay,
        count: 0,
      },
      update: {
        count: 0,
      },
    });
  } catch {
    // ignore
  }
}

export async function tryIncrementMonthlyQuota(): Promise<boolean> {
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-10"
  try {
    const usage = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: PROVIDER_NAME,
          month: currentMonth,
        },
      },
      select: { count: true },
    });

    if (usage && usage.count >= MAX_MONTHLY_QUOTA) {
      return false;
    }

    await prisma.apiUsage.upsert({
      where: {
        provider_month: {
          provider: PROVIDER_NAME,
          month: currentMonth,
        },
      },
      create: {
        provider: PROVIDER_NAME,
        month: currentMonth,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    });

    // Also increment daily quota tracking
    await tryIncrementDailyQuota().catch(() => false);

    return true;
  } catch (err) {
    console.error("[tomtom] Failed to check/increment ApiUsage quota:", err);
    return false;
  }
}

async function checkAndIncrementQuota(): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-10"
  const currentDay = new Date().toISOString().slice(0, 10);
  const dailyCount = await getDailyTomTomCallCount(currentDay);
  if (dailyCount >= MAX_DAILY_QUOTA) {
    throw new Error(
      `TomTom daily quota exceeded: reached ${MAX_DAILY_QUOTA} calls for ${currentDay}`
    );
  }
  const ok = await tryIncrementMonthlyQuota();
  if (!ok) {
    throw new Error(
      `TomTom monthly quota exceeded: reached ${MAX_MONTHLY_QUOTA} calls for ${currentMonth}`
    );
  }
}

export async function getMonthlyTomTomCallCount(): Promise<number> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const usage = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: PROVIDER_NAME,
          month: currentMonth,
        },
      },
      select: { count: true },
    });
    return usage?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function resetMonthlyTomTomCallCount(): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    await prisma.apiUsage.upsert({
      where: {
        provider_month: {
          provider: PROVIDER_NAME,
          month: currentMonth,
        },
      },
      create: {
        provider: PROVIDER_NAME,
        month: currentMonth,
        count: 0,
      },
      update: {
        count: 0,
      },
    });
  } catch {
    // ignore
  }
}

export function clearTomTomRouteCache(): void {
  routeCache.clear();
}

function makeCacheKey(options: CalculateRouteOptions): string {
  const pts = [options.origin, ...(options.waypoints || []), options.destination]
    .map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`)
    .join(":");
  const avoid = (options.avoidAreas || [])
    .map(
      (a) =>
        `${a.southWestCorner.latitude.toFixed(4)},${a.southWestCorner.longitude.toFixed(4)}-${a.northEastCorner.latitude.toFixed(4)},${a.northEastCorner.longitude.toFixed(4)}`
    )
    .join("|");
  return `${pts}|${options.travelMode || "car"}|${options.maxAlternatives ?? 2}|${options.traffic ?? true}|${options.departAt || ""}|${avoid}`;
}

export function parseTomTomRouteResponse(
  json: unknown,
  requestedMode: string = "car"
): TomTomRoute[] {
  const data = json as {
    routes?: Array<{
      summary?: {
        lengthInMeters?: number;
        travelTimeInSeconds?: number;
        trafficDelayInSeconds?: number;
        trafficLengthInMeters?: number;
        noTrafficTravelTimeInSeconds?: number;
        liveTrafficIncidentsTravelTimeInSeconds?: number;
        departureTime?: string;
        arrivalTime?: string;
      };
      legs?: Array<{
        points?: Array<{ latitude: number; longitude: number }>;
      }>;
      sections?: Array<{
        travelMode?: string;
      }>;
    }>;
  };

  if (!data?.routes || !Array.isArray(data.routes)) {
    return [];
  }

  const result: TomTomRoute[] = [];

  for (const r of data.routes) {
    const summary = r.summary || {};
    const coords: [number, number][] = [];

    if (r.legs && Array.isArray(r.legs)) {
      for (const leg of r.legs) {
        if (leg.points && Array.isArray(leg.points)) {
          for (const pt of leg.points) {
            coords.push([pt.latitude, pt.longitude]);
          }
        }
      }
    }

    if (coords.length < 2) continue;

    const routeMode =
      r.sections?.[0]?.travelMode?.toLowerCase() || requestedMode.toLowerCase();

    const noTraffic =
      typeof summary.noTrafficTravelTimeInSeconds === "number"
        ? summary.noTrafficTravelTimeInSeconds
        : Math.max(0, (summary.travelTimeInSeconds || 0) - (summary.trafficDelayInSeconds || 0));

    result.push({
      coords,
      distanceMeters: summary.lengthInMeters || 0,
      travelTimeSeconds: summary.travelTimeInSeconds || 0,
      trafficDelaySeconds: summary.trafficDelayInSeconds || 0,
      trafficLengthMeters: summary.trafficLengthInMeters || 0,
      noTrafficTravelTimeSeconds: noTraffic,
      liveTrafficIncidentsTravelTimeSeconds: summary.liveTrafficIncidentsTravelTimeInSeconds,
      departureTime: summary.departureTime,
      arrivalTime: summary.arrivalTime,
      travelMode: routeMode,
    });
  }

  return result;
}

function loadSyntheticFixture(): TomTomRoute[] {
  try {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "routing",
      "synthetic-tomtom-route.json"
    );
    if (fs.existsSync(fixturePath)) {
      const content = fs.readFileSync(fixturePath, "utf-8");
      const parsed = JSON.parse(content);
      return parseTomTomRouteResponse(parsed, "car");
    }
  } catch {
    // ignore
  }

  // Built-in synthetic fallback along pilot corridor (Marathahalli to Kadubeesanahalli)
  return [
    {
      coords: [
        [12.9558, 77.7012],
        [12.951, 77.702],
        [12.944, 77.7005],
        [12.937, 77.696],
        [12.9352, 77.6946],
      ],
      distanceMeters: 4320,
      travelTimeSeconds: 540,
      trafficDelaySeconds: 60,
      trafficLengthMeters: 850,
      travelMode: "car",
    },
  ];
}

/**
 * Calculates safe routes via TomTom Routing API v1.
 * Enforces:
 * - India bounds checking (APP_REGION=IN)
 * - 5-minute request caching
 * - 20,000 monthly quota cap
 * - Keys-later synthetic fallback when TOMTOM_API_KEY is not set
 */
export async function calculateTomTomRoute(
  options: CalculateRouteOptions
): Promise<CalculateRouteResult> {
  // Validate coordinates in India
  if (!isLocationInIndia(options.origin)) {
    throw new Error(
      `Origin coordinate (${options.origin.latitude}, ${options.origin.longitude}) is outside India (APP_REGION=IN)`
    );
  }
  if (!isLocationInIndia(options.destination)) {
    throw new Error(
      `Destination coordinate (${options.destination.latitude}, ${options.destination.longitude}) is outside India (APP_REGION=IN)`
    );
  }
  if (options.waypoints) {
    for (const wp of options.waypoints) {
      if (!isLocationInIndia(wp)) {
        throw new Error(
          `Waypoint coordinate (${wp.latitude}, ${wp.longitude}) is outside India (APP_REGION=IN)`
        );
      }
    }
  }

  // Check cache first
  const cacheKey = makeCacheKey(options);
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.data,
      cached: true,
    };
  }

  // Keys-later mode check
  if (!isConfigured("TOMTOM_API_KEY")) {
    const syntheticRoutes = loadSyntheticFixture();
    const result: CalculateRouteResult = {
      routes: syntheticRoutes,
      travelModeUsed: options.travelMode || "car",
      fallbackNote: "TomTom routing disabled – key not set (keys-later mode)",
      cached: false,
      disabled: true,
      _synthetic: true,
    };
    routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  // Quota enforcement
  await checkAndIncrementQuota();

  const apiKey = env.TOMTOM_API_KEY!;
  const allPoints = [
    options.origin,
    ...(options.waypoints || []),
    options.destination,
  ];
  const locationsParam = allPoints
    .map((p) => `${p.latitude},${p.longitude}`)
    .join(":");

  // Map travel modes: wheelchair maps to pedestrian in TomTom
  let travelModeParam = (options.travelMode || "car").toLowerCase();
  let fallbackNote: string | undefined;
  if (travelModeParam === "wheelchair") {
    travelModeParam = "pedestrian";
    fallbackNote = "Wheelchair mode mapped to pedestrian in TomTom routing.";
  }

  const queryParams = new URLSearchParams({
    key: apiKey,
    traffic: options.traffic !== false ? "true" : "false",
    travelMode: travelModeParam,
    maxAlternatives: String(
      Math.min(5, Math.max(0, options.maxAlternatives ?? 2))
    ),
    language: "en-IN",
    routeType: options.routeType || "fastest",
  });

  if (options.departAt) {
    queryParams.set("departAt", options.departAt);
  }

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locationsParam}/json?${queryParams.toString()}`;

  const hasAvoidAreas = Boolean(
    options.avoidAreas && options.avoidAreas.length > 0
  );

  let response: Response;
  const fetchOptions: RequestInit = hasAvoidAreas
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avoidAreas: {
            rectangles: options.avoidAreas,
          },
        }),
      }
    : {
        method: "GET",
      };

  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    throw new Error(
      `Failed to reach TomTom Routing API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // If motorcycle is rejected (some regions don't support motorcycle routing in TomTom), retry with car
  if (!response.ok && travelModeParam === "motorcycle") {
    queryParams.set("travelMode", "car");
    const retryUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locationsParam}/json?${queryParams.toString()}`;
    const retryRes = await fetch(retryUrl, fetchOptions);
    if (retryRes.ok) {
      const data = await retryRes.json();
      const routes = parseTomTomRouteResponse(data, "car");
      const result: CalculateRouteResult = {
        routes,
        travelModeUsed: "car",
        fallbackNote:
          "Motorcycle travelMode not supported by TomTom in this corridor; fell back to car.",
        cached: false,
        disabled: false,
      };
      routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `TomTom Routing API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const routes = parseTomTomRouteResponse(data, travelModeParam);

  const result: CalculateRouteResult = {
    routes,
    travelModeUsed: travelModeParam,
    fallbackNote,
    cached: false,
    disabled: false,
  };

  routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export interface FlowSegmentResult {
  currentSpeed: number;
  freeFlowSpeed: number;
  confidence: number;
  frc: string;
  coordinates?: Array<{ latitude: number; longitude: number }>;
}

// 15-minute flow segment cache
interface FlowCacheEntry {
  data: FlowSegmentResult;
  timestamp: number;
}

const flowCache = new Map<string, FlowCacheEntry>();
const FLOW_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function clearTomTomFlowCache(): void {
  flowCache.clear();
}

/**
 * Retrieves real-time traffic flow segment data via TomTom Traffic Flow API (absolute, zoom 10).
 * Enforces:
 * - India geographical bounding box
 * - 15-minute in-memory cache
 * - Shared monthly request quota counter (20,000 / month cap)
 * - Returns null on missing API key, quota hit, network error, or invalid payload (never throws)
 */
export async function getFlowSegment(
  lat: number,
  lng: number
): Promise<FlowSegmentResult | null> {
  // India bounds check
  if (!isLocationInIndia({ latitude: lat, longitude: lng })) {
    return null;
  }

  // 15-minute cache check
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = flowCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FLOW_CACHE_TTL_MS) {
    return cached.data;
  }

  // Key check
  if (!isConfigured("TOMTOM_API_KEY")) {
    return null;
  }

  // Quota check
  if (!(await tryIncrementMonthlyQuota())) {
    return null;
  }

  try {
    const apiKey = env.TOMTOM_API_KEY!;
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(apiKey)}&point=${lat},${lng}&unit=KMPH`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      flowSegmentData?: {
        currentSpeed?: number;
        freeFlowSpeed?: number;
        confidence?: number;
        frc?: string;
        coordinates?: {
          coordinate?: Array<{ latitude: number; longitude: number }>;
        };
      };
    };
    const flow = json?.flowSegmentData;
    if (
      !flow ||
      typeof flow.currentSpeed !== "number" ||
      typeof flow.freeFlowSpeed !== "number" ||
      !Number.isFinite(flow.currentSpeed) ||
      !Number.isFinite(flow.freeFlowSpeed)
    ) {
      return null;
    }

    const result: FlowSegmentResult = {
      currentSpeed: flow.currentSpeed,
      freeFlowSpeed: flow.freeFlowSpeed,
      confidence: typeof flow.confidence === "number" ? flow.confidence : 0,
      frc: typeof flow.frc === "string" ? flow.frc : "FRC4",
      coordinates: Array.isArray(flow.coordinates?.coordinate)
        ? flow.coordinates?.coordinate
        : undefined,
    };

    flowCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return null;
  }
}

