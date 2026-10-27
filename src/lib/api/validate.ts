import { z } from "zod";
import { NextResponse } from "next/server";
import { validationErrorResponse, apiError } from "./errors";

export const PILOT_BOUNDS = {
  minLat: 11.5,
  maxLat: 14.5,
  minLng: 76.5,
  maxLng: 78.5,
  maxGpsAccuracyM: 30,
} as const;

export const coordinateSchema = z.object({
  lat: z
    .number({
      error: "Latitude is required and must be a number",
    })
    .finite("Latitude must be a finite number")
    .min(
      PILOT_BOUNDS.minLat,
      `Latitude must be within pilot bounds [${PILOT_BOUNDS.minLat}, ${PILOT_BOUNDS.maxLat}]`
    )
    .max(
      PILOT_BOUNDS.maxLat,
      `Latitude must be within pilot bounds [${PILOT_BOUNDS.minLat}, ${PILOT_BOUNDS.maxLat}]`
    ),
  lng: z
    .number({
      error: "Longitude is required and must be a number",
    })
    .finite("Longitude must be a finite number")
    .min(
      PILOT_BOUNDS.minLng,
      `Longitude must be within pilot bounds [${PILOT_BOUNDS.minLng}, ${PILOT_BOUNDS.maxLng}]`
    )
    .max(
      PILOT_BOUNDS.maxLng,
      `Longitude must be within pilot bounds [${PILOT_BOUNDS.minLng}, ${PILOT_BOUNDS.maxLng}]`
    ),
});

export const evidenceGpsSchema = coordinateSchema.extend({
  gpsAccuracyM: z
    .number({
      error: "GPS accuracy in metres is required and must be a number",
    })
    .finite("GPS accuracy must be a finite number")
    .min(0, "GPS accuracy must be non-negative")
    .max(
      PILOT_BOUNDS.maxGpsAccuracyM,
      `GPS accuracy must be within ${PILOT_BOUNDS.maxGpsAccuracyM}m for verified evidence`
    ),
});

export async function parseJson<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      data: null,
      error: apiError(400, "INVALID_JSON", "Request body must be valid JSON"),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      data: null,
      error: validationErrorResponse(result.error),
    };
  }

  return {
    data: result.data,
    error: null,
  };
}
