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
import { getDayIST, getISTComponents } from "@/lib/time/ist";

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
  const currentDay = getDayIST(result);
  let daysToAdd = targetDayOfWeek - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  result.setDate(result.getDate() + daysToAdd);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Formats a local date and hour into an ISO string with Indian Standard Time (+05:30).
 */
export function formatTomTomDepartAt(date: Date, hour: number): string {
  const comp = getISTComponents(date);
  const hh = String(hour).padStart(2, "0");
  return `${comp.dateStr}T${hh}:00:00+05:30`;
}

/**
 * Interpolates missing (ESTIMATED) hours from neighbouring TOMTOM_HISTORIC hours within the same dayType.
 * (e.g. 21:00 = average of 20:00 and 22:00). Falls back to flat road-class baseline only if no TomTom hours exist.
 */
export function interpolateMissingHours<
  T extends { hour: number; dayType: DayType; delayRatio: number; source: ProfileSource }
>(points: T[], isArterial: boolean): T[] {
  for (const dayType of [DayType.WEEKDAY, DayType.WEEKEND]) {
    const dayPoints = points.filter((p) => p.dayType === dayType);
    const tomtomHours = dayPoints.filter((p) => p.source === ProfileSource.TOMTOM_HISTORIC);

    if (tomtomHours.length === 0) {
      continue;
    }

    for (const p of dayPoints) {
      if (p.source === ProfileSource.TOMTOM_HISTORIC) {
        continue;
      }

      // Find closest previous TomTom hour (24-hour circular)
      let prevPoint = tomtomHours[0];
      let prevDist = 24;
      for (const t of tomtomHours) {
        const dist = (p.hour - t.hour + 24) % 24;
        if (dist > 0 && dist < prevDist) {
          prevDist = dist;
          prevPoint = t;
        }
      }

      // Find closest next TomTom hour (24-hour circular)
      let nextPoint = tomtomHours[0];
      let nextDist = 24;
      for (const t of tomtomHours) {
        const dist = (t.hour - p.hour + 24) % 24;
        if (dist > 0 && dist < nextDist) {
          nextDist = dist;
          nextPoint = t;
        }
      }

      if (prevDist + nextDist > 0) {
        const interpolated =
          (nextDist * prevPoint.delayRatio + prevDist * nextPoint.delayRatio) /
          (prevDist + nextDist);
        p.delayRatio = Math.round(interpolated * 1000) / 1000;
      } else {
        p.delayRatio = prevPoint.delayRatio;
      }
      p.source = ProfileSource.ESTIMATED;
    }
  }

  return points;
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

  // 1. Check if issue already has a fresh and complete profile
  const existingTomTomMap = new Map<
    string,
    { hour: number; dayType: DayType; delayRatio: number; source: ProfileSource }
  >();

  if (!forceRefresh) {
    const existing = await prisma.placeTrafficProfile.findMany({
      where: {
        issueId: issue.id,
        fetchedAt: { gte: validSince },
      },
      orderBy: [{ dayType: "asc" }, { hour: "asc" }],
    });

    const isMajor = Boolean(
      issue.roadClass &&
        ["motorway", "trunk", "primary", "secondary"].includes(
          issue.roadClass.toLowerCase()
        )
    );

    const hasInvalidAllZeroDay =
      isMajor &&
      [DayType.WEEKDAY, DayType.WEEKEND].some((dt) => {
        const daytime = existing.filter(
          (p) => p.dayType === dt && p.hour >= 7 && p.hour <= 20
        );
        return daytime.length > 0 && daytime.every((p) => p.delayRatio === 0);
      });

    const isComplete =
      !hasInvalidAllZeroDay &&
      existing.length === 48 &&
      existing.every(
        (p) =>
          p.source === ProfileSource.TOMTOM_HISTORIC ||
          p.source === ProfileSource.LIVE_SAMPLE
      );

    if (isComplete) {
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

    // Retain existing TOMTOM_HISTORIC or LIVE_SAMPLE points so we only query missing/estimated hours,
    // but drop any dayType whose daytime profile is all-zero on a major corridor
    for (const dt of [DayType.WEEKDAY, DayType.WEEKEND]) {
      const dtPoints = existing.filter((p) => p.dayType === dt);
      const daytime = dtPoints.filter((p) => p.hour >= 7 && p.hour <= 20);
      const isInvalid = isMajor && daytime.length > 0 && daytime.every((p) => p.delayRatio === 0);
      if (!isInvalid) {
        for (const p of dtPoints) {
          if (
            p.source === ProfileSource.TOMTOM_HISTORIC ||
            p.source === ProfileSource.LIVE_SAMPLE
          ) {
            existingTomTomMap.set(`${p.dayType}-${p.hour}`, {
              hour: p.hour,
              dayType: p.dayType,
              delayRatio: p.delayRatio,
              source: p.source,
            });
          }
        }
      }
    }

    // 2. Check if a nearby issue within 150m on the same road segment has a fresh complete profile
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

            const isSharedComplete =
              sharedPoints.length === 48 &&
              sharedPoints.every(
                (p) =>
                  p.source === ProfileSource.TOMTOM_HISTORIC ||
                  p.source === ProfileSource.LIVE_SAMPLE
              );

            if (isSharedComplete) {
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

  const tasksToQuery: Array<{ dayType: DayType; hour: number; targetDate: Date }> = [];
  for (const dayType of [DayType.WEEKDAY, DayType.WEEKEND]) {
    const targetDate = dayType === DayType.WEEKDAY ? nextTue : nextSun;
    for (let hour = 0; hour < 24; hour++) {
      const key = `${dayType}-${hour}`;
      const cached = existingTomTomMap.get(key);
      if (cached) {
        pointsToCreate.push(cached);
      } else {
        tasksToQuery.push({ dayType, hour, targetDate });
      }
    }
  }

  // Process concurrently in batches of 4 with a 200ms pause to respect TomTom 5 QPS rate limit
  const BATCH_SIZE = 4;
  for (let i = 0; i < tasksToQuery.length; i += BATCH_SIZE) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const batch = tasksToQuery.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ dayType, hour, targetDate }) => {
        let delayRatio = getEstimatedHourlyDelay(hour, dayType, isArterial);
        let pointSource: ProfileSource = ProfileSource.ESTIMATED;

        if (canUseTomTom) {
          const departAtIso = formatTomTomDepartAt(targetDate, hour);
          let routeResult = null;

          try {
            routeResult = await calculateTomTomRoute({
              origin,
              destination,
              traffic: true,
              departAt: departAtIso,
              travelMode: "car",
              maxAlternatives: 0,
            });
          } catch {
            // Retry that hour once after a short wait (250ms) to recover from rate limits / network blips
            await new Promise((resolve) => setTimeout(resolve, 250));
            try {
              routeResult = await calculateTomTomRoute({
                origin,
                destination,
                traffic: true,
                departAt: departAtIso,
                travelMode: "car",
                maxAlternatives: 0,
              });
            } catch {
              routeResult = null;
            }
          }

          if (routeResult && routeResult.routes.length > 0) {
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

  // Validate that FRC0-FRC3 / arterial roads do not store an all-zero daytime profile.
  // If historic time is missing or equals no-traffic for every hour, treat that day's profile as FAILED
  // (source ESTIMATED with low confidence, retry next traffic-profile run) instead of storing zeros.
  const isMajorRoad = Boolean(
    (issue.roadClass && ["motorway", "trunk", "primary", "secondary"].includes(issue.roadClass.toLowerCase())) ||
    (flow?.frc && ["FRC0", "FRC1", "FRC2", "FRC3"].includes(flow.frc))
  );

  for (const dayType of [DayType.WEEKDAY, DayType.WEEKEND]) {
    const dayPoints = pointsToCreate.filter((p) => p.dayType === dayType);
    const tomtomDaytime = dayPoints.filter(
      (p) => p.source === ProfileSource.TOMTOM_HISTORIC && p.hour >= 7 && p.hour <= 20
    );

    const tomtomAllZero =
      tomtomDaytime.length === 0 ||
      tomtomDaytime.every((p) => p.delayRatio === 0);

    if (isMajorRoad && tomtomAllZero) {
      for (const p of dayPoints) {
        p.delayRatio = getEstimatedHourlyDelay(p.hour, dayType, isArterial);
        p.source = ProfileSource.ESTIMATED;
      }
    }
  }

  // Interpolate any hours missing TomTom data from neighbouring TomTom hours before blending live samples
  interpolateMissingHours(pointsToCreate, isArterial);

  // Safety guard: Never store an all-zero daytime profile for an FRC0-FRC3 road after interpolation
  for (const dayType of [DayType.WEEKDAY, DayType.WEEKEND]) {
    const dayPoints = pointsToCreate.filter((p) => p.dayType === dayType);
    const daytimePoints = dayPoints.filter((p) => p.hour >= 7 && p.hour <= 20);
    if (isMajorRoad && daytimePoints.every((p) => p.delayRatio === 0)) {
      for (const p of dayPoints) {
        p.delayRatio = getEstimatedHourlyDelay(p.hour, dayType, isArterial);
        p.source = ProfileSource.ESTIMATED;
      }
    }
  }

  // Blend live samples if present
  for (const p of pointsToCreate) {
    const sampleKey = `${p.dayType}-${p.hour}`;
    const sampleData = sampleMap.get(sampleKey);
    if (sampleData && sampleData.count > 0) {
      const avgSampleDelay = sampleData.sumDelay / sampleData.count;
      p.delayRatio =
        Math.round(
          ((p.delayRatio * 10 + avgSampleDelay * sampleData.count) /
            (10 + sampleData.count)) *
            1000
        ) / 1000;
      if (p.source === ProfileSource.ESTIMATED) {
        p.source = ProfileSource.LIVE_SAMPLE;
      }
    }
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
