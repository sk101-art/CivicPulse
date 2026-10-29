import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  calculateTomTomRoute,
  getFlowSegment,
  getDailyTomTomCallCount,
  MAX_DAILY_QUOTA,
  LatLngPoint,
} from "@/lib/external/tomtom";
import { isConfigured } from "@/lib/env";
import { DayType, ProfileSource } from "@prisma/client";

export interface PlaceProfilePoint {
  hour: number;
  dayType: DayType;
  delayRatio: number;
  source: ProfileSource;
  direction?: string;
  fetchedAt: Date;
}

export interface PlaceProfileResult {
  points: PlaceProfilePoint[];
  source: ProfileSource;
  fromCache: boolean;
  sharedFrom?: string;
}

export const PROFILE_TTL_DAYS = 14;
const PROFILE_TTL_MS = PROFILE_TTL_DAYS * 24 * 60 * 60 * 1000;
const PROBE_OFFSET_METRES = 150;

/**
 * Calculates bearing in degrees between two lat/lng coordinates (0 = North, 90 = East).
 */
export function calculateBearingDeg(
  start: LatLngPoint,
  end: LatLngPoint
): number {
  const lat1 = (start.latitude * Math.PI) / 180;
  const lat2 = (end.latitude * Math.PI) / 180;
  const dLng = ((end.longitude - start.longitude) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Computes a coordinate offset by distanceMetres along bearingDeg.
 */
export function offsetCoordinate(
  point: LatLngPoint,
  distanceMetres: number,
  bearingDeg: number
): LatLngPoint {
  const r = 6371000; // Earth radius in metres
  const brng = (bearingDeg * Math.PI) / 180;
  const latRad = (point.latitude * Math.PI) / 180;
  const lngRad = (point.longitude * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distanceMetres / r) +
      Math.cos(latRad) * Math.sin(distanceMetres / r) * Math.cos(brng)
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceMetres / r) * Math.cos(latRad),
      Math.cos(distanceMetres / r) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  return {
    latitude: (newLatRad * 180) / Math.PI,
    longitude: (newLngRad * 180) / Math.PI,
  };
}

/**
 * Returns deterministic baseline delay ratios by hour and dayType for Indian urban arterial/collector roads.
 */
export function getEstimatedHourlyDelay(
  hour: number,
  dayType: DayType,
  isArterial: boolean = true
): number {
  if (dayType === DayType.WEEKDAY) {
    if (hour >= 0 && hour <= 5) return 0.05;
    if (hour >= 8 && hour <= 11) return isArterial ? 0.85 : 0.65;
    if (hour >= 12 && hour <= 16) return isArterial ? 0.35 : 0.25;
    if (hour >= 17 && hour <= 21) return isArterial ? 1.05 : 0.80;
    if (hour === 6 || hour === 7) return 0.20;
    return 0.15; // 22, 23
  } else {
    // Weekend (Sunday)
    if (hour >= 0 && hour <= 6) return 0.04;
    if (hour >= 11 && hour <= 14) return 0.40;
    if (hour >= 17 && hour <= 21) return 0.55;
    if (hour >= 7 && hour <= 10) return 0.20;
    return 0.15;
  }
}

/**
 * Gets the next occurrence of a target day of the week (0 = Sunday, 2 = Tuesday).
 */
export function getNextTargetDate(targetDayOfWeek: number, baseDate: Date = new Date()): Date {
  const result = new Date(baseDate);
  const currentDay = result.getDay();
  let daysToAdd = targetDayOfWeek - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  result.setDate(result.getDate() + daysToAdd);
  result.setHours(0, 0, 0, 0);
  return result;
}

export interface BuildPlaceProfileInput {
  id: string;
  lat: number;
  lng: number;
  segmentId?: string | null;
  roadClass?: string | null;
}

/**
 * Builds or refreshes the 48-slot (24 weekday + 24 weekend) PlaceTrafficProfile.
 * - Reuses existing profiles within 14 days.
 * - Shares profiles with issues within 150m on the same segment.
 * - Probes ~300m route along road bearing via TomTom Routing with departAt.
 * - Blends live TrafficSample rows when present.
 * - Enforces daily 1,200 call budget & graceful fallback to ESTIMATED.
 */
export async function buildPlaceProfile(
  issue: BuildPlaceProfileInput,
  forceRefresh: boolean = false
): Promise<PlaceProfileResult> {
  const now = new Date();
  const validSince = new Date(now.getTime() - PROFILE_TTL_MS);

  // 1. Check if issue already has a fresh profile
  if (!forceRefresh) {
    const existing = await prisma.placeTrafficProfile.findMany({
      where: {
        issueId: issue.id,
        fetchedAt: { gte: validSince },
      },
      orderBy: [{ dayType: "asc" }, { hour: "asc" }],
    });

    if (existing.length === 48) {
      return {
        points: existing.map((p) => ({
          hour: p.hour,
          dayType: p.dayType,
          delayRatio: p.delayRatio,
          source: p.source,
          direction: p.direction || "BOTH",
          fetchedAt: p.fetchedAt,
        })),
        source: existing[0].source,
        fromCache: true,
      };
    }

    // 2. Check if a nearby issue within 150m on the same road segment has a fresh profile
    if (issue.segmentId) {
      const candidateProfiles = await prisma.placeTrafficProfile.findMany({
        where: {
          segmentId: issue.segmentId,
          fetchedAt: { gte: validSince },
          AND: [
            { issueId: { not: issue.id } },
            { issueId: { not: null } },
          ],
        },
        distinct: ["issueId"],
        select: { issueId: true },
        take: 20,
      });

      for (const cp of candidateProfiles) {
        if (!cp.issueId) continue;
        const sourceIssue = await prisma.issue.findUnique({
          where: { id: cp.issueId },
          select: { lat: true, lng: true },
        });

        if (sourceIssue) {
          const distanceM = calculateDistanceM(
            { latitude: issue.lat, longitude: issue.lng },
            { latitude: sourceIssue.lat, longitude: sourceIssue.lng }
          );

          if (distanceM <= 150) {
            const sharedPoints = await prisma.placeTrafficProfile.findMany({
              where: {
                issueId: cp.issueId,
                fetchedAt: { gte: validSince },
              },
              orderBy: [{ dayType: "asc" }, { hour: "asc" }],
            });

            if (sharedPoints.length === 48) {
              return {
                points: sharedPoints.map((p) => ({
                  hour: p.hour,
                  dayType: p.dayType,
                  delayRatio: p.delayRatio,
                  source: p.source,
                  direction: p.direction || "BOTH",
                  fetchedAt: p.fetchedAt,
                })),
                source: sharedPoints[0].source,
                fromCache: true,
                sharedFrom: cp.issueId,
              };
            }
          }
        }
      }
    }
  }

  // 3. Construct ~300m probe route through the issue point
  const flow = await getFlowSegment(issue.lat, issue.lng).catch(() => null);
  let origin: LatLngPoint;
  let destination: LatLngPoint;

  if (flow?.coordinates && flow.coordinates.length >= 2) {
    const coords = flow.coordinates;
    const bearing = calculateBearingDeg(coords[0], coords[coords.length - 1]);
    origin = offsetCoordinate(
      { latitude: issue.lat, longitude: issue.lng },
      PROBE_OFFSET_METRES,
      (bearing + 180) % 360
    );
    destination = offsetCoordinate(
      { latitude: issue.lat, longitude: issue.lng },
      PROBE_OFFSET_METRES,
      bearing
    );
  } else {
    // Default East-West corridor bearing (90°)
    origin = offsetCoordinate(
      { latitude: issue.lat, longitude: issue.lng },
      PROBE_OFFSET_METRES,
      270 // West
    );
    destination = offsetCoordinate(
      { latitude: issue.lat, longitude: issue.lng },
      PROBE_OFFSET_METRES,
      90 // East
    );
  }

  // 4. Fetch live samples for blending
  const liveSamples = await prisma.trafficSample.findMany({
    where: {
      OR: [
        { issueId: issue.id },
        ...(issue.segmentId ? [{ segmentId: issue.segmentId }] : []),
      ],
    },
    select: {
      hourOfWeek: true,
      currentSpeed: true,
      freeFlowSpeed: true,
      congestionR: true,
    },
  });

  // Group samples by dayType and hour
  // Sunday = day 0, Tuesday = day 2
  const sampleMap = new Map<string, { sumDelay: number; count: number }>();
  for (const s of liveSamples) {
    const day = Math.floor(s.hourOfWeek / 24);
    const hour = s.hourOfWeek % 24;
    const isWeekend = day === 0 || day === 6;
    const key = `${isWeekend ? DayType.WEEKEND : DayType.WEEKDAY}-${hour}`;

    const delay =
      s.congestionR > 0
        ? s.congestionR
        : s.freeFlowSpeed > 0 && s.currentSpeed < s.freeFlowSpeed
          ? (s.freeFlowSpeed - s.currentSpeed) / s.freeFlowSpeed
          : 0;

    const current = sampleMap.get(key) || { sumDelay: 0, count: 0 };
    current.sumDelay += delay;
    current.count += 1;
    sampleMap.set(key, current);
  }

  // 5. Build 48 hourly delay ratios (24 weekday + 24 weekend)
  const isArterial =
    (issue.roadClass && ["primary", "secondary", "trunk", "motorway"].includes(issue.roadClass)) ||
    (flow?.frc && ["FRC0", "FRC1", "FRC2"].includes(flow.frc)) ||
    true;

  const pointsToCreate: Array<{
    dayType: DayType;
    hour: number;
    delayRatio: number;
    source: ProfileSource;
  }> = [];

  const nextTue = getNextTargetDate(2, now); // Tuesday
  const nextSun = getNextTargetDate(0, now); // Sunday

  const dailyUsage = await getDailyTomTomCallCount().catch(() => 0);
  const canUseTomTom = isConfigured("TOMTOM_API_KEY") && dailyUsage + 48 <= MAX_DAILY_QUOTA;

  const tasks: Array<{ dayType: DayType; hour: number; targetDate: Date }> = [];
  for (const dayType of [DayType.WEEKDAY, DayType.WEEKEND]) {
    const targetDate = dayType === DayType.WEEKDAY ? nextTue : nextSun;
    for (let hour = 0; hour < 24; hour++) {
      tasks.push({ dayType, hour, targetDate });
    }
  }

  // Process concurrently in batches of 8 to balance speed and connection limits
  const BATCH_SIZE = 8;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ dayType, hour, targetDate }) => {
        let delayRatio = getEstimatedHourlyDelay(hour, dayType, isArterial);
        let pointSource: ProfileSource = ProfileSource.ESTIMATED;

        if (canUseTomTom) {
          try {
            const yyyy = targetDate.getFullYear();
            const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
            const dd = String(targetDate.getDate()).padStart(2, "0");
            const hh = String(hour).padStart(2, "0");
            const departAtIso = `${yyyy}-${mm}-${dd}T${hh}:00:00`;

            const routeResult = await calculateTomTomRoute({
              origin,
              destination,
              traffic: true,
              departAt: departAtIso,
              travelMode: "car",
              maxAlternatives: 0,
            });

            if (routeResult.routes.length > 0) {
              const route = routeResult.routes[0];
              const travelTime = route.travelTimeSeconds;
              const noTraffic =
                route.noTrafficTravelTimeSeconds ||
                (travelTime - route.trafficDelaySeconds);

              if (noTraffic > 0 && travelTime >= noTraffic) {
                delayRatio = Math.max(0, (travelTime - noTraffic) / noTraffic);
                pointSource = ProfileSource.TOMTOM_HISTORIC;
              }
            }
          } catch {
            delayRatio = getEstimatedHourlyDelay(hour, dayType, isArterial);
            pointSource = ProfileSource.ESTIMATED;
          }
        }

        // Blend live samples if present
        const sampleKey = `${dayType}-${hour}`;
        const sampleData = sampleMap.get(sampleKey);
        if (sampleData && sampleData.count > 0) {
          const avgSampleDelay = sampleData.sumDelay / sampleData.count;
          delayRatio =
            (delayRatio * 10 + avgSampleDelay * sampleData.count) /
            (10 + sampleData.count);
          if (pointSource === ProfileSource.ESTIMATED) {
            pointSource = ProfileSource.LIVE_SAMPLE;
          }
        }

        return {
          dayType,
          hour,
          delayRatio: Math.round(delayRatio * 1000) / 1000,
          source: pointSource,
        };
      })
    );

    pointsToCreate.push(...batchResults);
  }

  // 6. Persist to database in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.placeTrafficProfile.deleteMany({
      where: { issueId: issue.id },
    });

    await tx.placeTrafficProfile.createMany({
      data: pointsToCreate.map((p) => ({
        issueId: issue.id,
        segmentId: issue.segmentId || null,
        direction: "BOTH",
        dayType: p.dayType,
        hour: p.hour,
        delayRatio: p.delayRatio,
        source: p.source,
        fetchedAt: now,
      })),
    });
  });

  const overallSource = pointsToCreate.some((p) => p.source === ProfileSource.TOMTOM_HISTORIC)
    ? ProfileSource.TOMTOM_HISTORIC
    : pointsToCreate.some((p) => p.source === ProfileSource.LIVE_SAMPLE)
      ? ProfileSource.LIVE_SAMPLE
      : ProfileSource.ESTIMATED;

  return {
    points: pointsToCreate.map((p) => ({
      hour: p.hour,
      dayType: p.dayType,
      delayRatio: p.delayRatio,
      source: p.source,
      direction: "BOTH",
      fetchedAt: now,
    })),
    source: overallSource,
    fromCache: false,
  };
}

/**
 * Calculates Haversine distance in metres between two coordinates.
 */
export function calculateDistanceM(p1: LatLngPoint, p2: LatLngPoint): number {
  const R = 6371000;
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLng = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.latitude * Math.PI) / 180) *
      Math.cos((p2.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
