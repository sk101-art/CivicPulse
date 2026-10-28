import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calculateTomTomRoute,
  LatLngPoint,
  SupportedTravelMode,
} from "@/lib/external/tomtom";
import {
  VehicleType,
  calculateHazardCost,
  calculateRouteScore,
  chooseBestRoute,
  buildAvoidAreasForCriticalHazards,
  EvaluatedRoute,
  IssueSummary,
} from "@/lib/routing/cost";
import { matchSegmentsToRoute } from "@/lib/routing/matchSegments";
import { prisma } from "@/lib/db/prisma";
import { Band } from "@prisma/client";
import { withAuth } from "@/lib/api/auth";

const pointSchema = z.union([
  z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  z.tuple([z.number(), z.number()]).transform(([lat, lon]) => ({
    latitude: lat,
    longitude: lon,
  })),
]);

const avoidRectangleSchema = z.object({
  southWestCorner: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  northEastCorner: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const routeRequestSchema = z.object({
  origin: pointSchema,
  destination: pointSchema,
  waypoints: z.array(pointSchema).optional(),
  travelMode: z
    .enum([
      "car",
      "motorcycle",
      "pedestrian",
      "bicycle",
      "wheelchair",
      "truck",
      "taxi",
      "bus",
      "van",
    ])
    .optional(),
  vehicle: z.enum(["motorcycle", "car", "pedestrian", "wheelchair"]).optional(),
  beta: z.number().min(0).max(0.5).optional(),
  maxAlternatives: z.number().int().min(0).max(5).optional(),
  traffic: z.boolean().optional(),
  departAt: z.string().optional(),
  avoidAreas: z.array(avoidRectangleSchema).optional(),
});

export async function POST(req: NextRequest) {
  // Routing spends the free TomTom quota, so only signed-in users may call it.
  const auth = await withAuth();
  if (auth.error) {
    return auth.error;
  }

  try {
    const rawBody = await req.json();
    const parsed = routeRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid route request parameters",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      origin,
      destination,
      waypoints,
      travelMode,
      vehicle,
      beta,
      maxAlternatives,
      traffic,
      departAt,
      avoidAreas,
    } = parsed.data;

    const selectedVehicle: VehicleType =
      vehicle ||
      (travelMode === "pedestrian"
        ? "pedestrian"
        : travelMode === "wheelchair"
        ? "wheelchair"
        : travelMode === "car"
        ? "car"
        : "motorcycle");

    const effectiveBeta = beta !== undefined ? beta : 0.15;

    // Fetch critical blocking issues to build automatic avoidAreas
    let hardAvoidAreas = avoidAreas ? [...avoidAreas] : [];
    try {
      const criticalBlockingIssues = await prisma.issue.findMany({
        where: {
          status: { in: ["OPEN", "CONFIRMED", "IN_PROGRESS", "DISPUTED"] },
          band: Band.CRITICAL,
          blockedShare: "full",
        },
        select: {
          id: true,
          category: true,
          priority: true,
          band: true,
          blockedShare: true,
          lat: true,
          lng: true,
        },
      });

      if (criticalBlockingIssues.length > 0) {
        const autoAvoids = buildAvoidAreasForCriticalHazards(
          criticalBlockingIssues.map((i) => ({
            ...i,
            priorityBand: i.band.toString(),
          }))
        );
        hardAvoidAreas = [...hardAvoidAreas, ...autoAvoids];
      }
    } catch {
      // ignore db error in isolated tests
    }

    const result = await calculateTomTomRoute({
      origin: origin as LatLngPoint,
      destination: destination as LatLngPoint,
      waypoints: waypoints as LatLngPoint[] | undefined,
      travelMode: (travelMode || selectedVehicle) as SupportedTravelMode,
      maxAlternatives: maxAlternatives ?? 2,
      traffic,
      departAt,
      avoidAreas: hardAvoidAreas.length > 0 ? hardAvoidAreas : undefined,
    });

    // Evaluate hazard cost and route score for each route alternative
    const evaluatedRoutes: EvaluatedRoute[] = [];

    for (let idx = 0; idx < result.routes.length; idx++) {
      const r = result.routes[idx];
      let matchedIssues: IssueSummary[] = [];

      try {
        const segmentIds = await matchSegmentsToRoute(r.coords);
        if (segmentIds.length > 0) {
          const dbIssues = await prisma.issue.findMany({
            where: {
              status: { in: ["OPEN", "CONFIRMED", "IN_PROGRESS", "DISPUTED"] },
              segmentId: { in: segmentIds },
            },
            select: {
              id: true,
              category: true,
              priority: true,
              band: true,
              blockedShare: true,
              lat: true,
              lng: true,
              segmentId: true,
            },
          });
          matchedIssues = dbIssues.map((i) => ({
            ...i,
            priorityBand: i.band.toString(),
          }));
        }
      } catch {
        // Fallback for isolated tests or empty DB
      }

      const hCost = calculateHazardCost(matchedIssues, selectedVehicle);
      const score = calculateRouteScore(r.travelTimeSeconds, hCost, effectiveBeta);

      evaluatedRoutes.push({
        index: idx,
        coords: r.coords,
        distanceMeters: r.distanceMeters,
        travelTimeSeconds: r.travelTimeSeconds,
        trafficDelaySeconds: r.trafficDelaySeconds,
        hazardCost: hCost,
        routeScore: score,
        issues: matchedIssues,
      });
    }

    const choice =
      evaluatedRoutes.length > 0
        ? chooseBestRoute(evaluatedRoutes)
        : null;

    return NextResponse.json({
      routes: evaluatedRoutes.map((er) => ({
        coords: er.coords,
        distance: er.distanceMeters,
        duration: er.travelTimeSeconds,
        delay: er.trafficDelaySeconds,
        hazardCost: er.hazardCost,
        routeScore: er.routeScore,
        hazardsCount: er.issues.length,
        summary: {
          lengthInMeters: er.distanceMeters,
          travelTimeInSeconds: er.travelTimeSeconds,
          trafficDelayInSeconds: er.trafficDelaySeconds,
        },
      })),
      selectedRouteIndex: choice?.bestRouteIndex ?? 0,
      explanation: choice?.explanation ?? "Direct route computed.",
      vehicle: selectedVehicle,
      beta: effectiveBeta,
      disabled: result.disabled ?? false,
      fallbackNote: result.fallbackNote ?? null,
      cached: result.cached,
      _synthetic: result._synthetic ?? false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to calculate route";
    const status = message.includes("outside India") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  const auth = await withAuth();
  if (auth.error) {
    return auth.error;
  }

  try {
    const url = new URL(req.url);
    const originParam = url.searchParams.get("origin");
    const destParam = url.searchParams.get("destination");
    const vehicleParam = (url.searchParams.get("vehicle") ||
      url.searchParams.get("travelMode") ||
      "motorcycle") as VehicleType;
    const betaParam = url.searchParams.get("beta");

    if (!originParam || !destParam) {
      return NextResponse.json(
        { error: "Both 'origin' and 'destination' query parameters are required" },
        { status: 400 }
      );
    }

    const [origLat, origLng] = originParam.split(",").map(Number);
    const [destLat, destLng] = destParam.split(",").map(Number);

    if (
      isNaN(origLat) ||
      isNaN(origLng) ||
      isNaN(destLat) ||
      isNaN(destLng)
    ) {
      return NextResponse.json(
        { error: "Coordinates must be comma-separated numbers (lat,lng)" },
        { status: 400 }
      );
    }

    const reqPost = new NextRequest(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { latitude: origLat, longitude: origLng },
        destination: { latitude: destLat, longitude: destLng },
        vehicle: vehicleParam,
        beta: betaParam ? parseFloat(betaParam) : 0.15,
      }),
    });

    return POST(reqPost);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to calculate route";
    const status = message.includes("outside India") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
