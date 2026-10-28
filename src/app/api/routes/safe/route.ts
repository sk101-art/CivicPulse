import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  calculateTomTomRoute,
  LatLngPoint,
  SupportedTravelMode,
  AvoidRectangle,
} from "@/lib/external/tomtom";

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
  maxAlternatives: z.number().int().min(0).max(5).optional(),
  traffic: z.boolean().optional(),
  departAt: z.string().optional(),
  avoidAreas: z.array(avoidRectangleSchema).optional(),
});

export async function POST(req: NextRequest) {
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
      maxAlternatives,
      traffic,
      departAt,
      avoidAreas,
    } = parsed.data;

    const result = await calculateTomTomRoute({
      origin: origin as LatLngPoint,
      destination: destination as LatLngPoint,
      waypoints: waypoints as LatLngPoint[] | undefined,
      travelMode: travelMode as SupportedTravelMode | undefined,
      maxAlternatives,
      traffic,
      departAt,
      avoidAreas: avoidAreas as AvoidRectangle[] | undefined,
    });

    return NextResponse.json({
      routes: result.routes.map((r) => ({
        coords: r.coords,
        distance: r.distanceMeters,
        duration: r.travelTimeSeconds,
        delay: r.trafficDelaySeconds,
        travelMode: r.travelMode,
        summary: {
          lengthInMeters: r.distanceMeters,
          travelTimeInSeconds: r.travelTimeSeconds,
          trafficDelayInSeconds: r.trafficDelaySeconds,
          trafficLengthInMeters: r.trafficLengthMeters,
          departureTime: r.departureTime,
          arrivalTime: r.arrivalTime,
        },
      })),
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
  try {
    const url = new URL(req.url);
    const originParam = url.searchParams.get("origin");
    const destParam = url.searchParams.get("destination");
    const travelMode = url.searchParams.get("travelMode") as
      | SupportedTravelMode
      | null;
    const maxAlternatives = url.searchParams.get("maxAlternatives");

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

    const result = await calculateTomTomRoute({
      origin: { latitude: origLat, longitude: origLng },
      destination: { latitude: destLat, longitude: destLng },
      travelMode: travelMode || "car",
      maxAlternatives: maxAlternatives ? parseInt(maxAlternatives, 10) : 2,
    });

    return NextResponse.json({
      routes: result.routes.map((r) => ({
        coords: r.coords,
        distance: r.distanceMeters,
        duration: r.travelTimeSeconds,
        delay: r.trafficDelaySeconds,
        travelMode: r.travelMode,
        summary: {
          lengthInMeters: r.distanceMeters,
          travelTimeInSeconds: r.travelTimeSeconds,
          trafficDelayInSeconds: r.trafficDelaySeconds,
          trafficLengthInMeters: r.trafficLengthMeters,
          departureTime: r.departureTime,
          arrivalTime: r.arrivalTime,
        },
      })),
      disabled: result.disabled ?? false,
      fallbackNote: result.fallbackNote ?? null,
      cached: result.cached,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to calculate route";
    const status = message.includes("outside India") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
