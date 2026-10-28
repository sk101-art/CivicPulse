import { prisma } from "@/lib/db/prisma";
import {
  fetchOpenMeteoForecast,
  HourlyWeatherRecord,
} from "@/lib/external/openmeteo";

export interface SyncWeatherResult {
  pointKey: string;
  count: number;
}

/**
 * Syncs 72-hour weather forecast for a spatial pointKey (ward ID or pilot coordinates).
 * Stores/upserts into WeatherForecast table.
 */
export async function syncWeatherForecast(
  pointKey: string,
  lat: number,
  lng: number,
  recordsOverride?: HourlyWeatherRecord[]
): Promise<SyncWeatherResult> {
  const records =
    recordsOverride || (await fetchOpenMeteoForecast(lat, lng, 3));

  if (records.length === 0) {
    return { pointKey, count: 0 };
  }

  // Use bulk SQL upsert for single round-trip performance over remote pooler
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  let pIdx = 1;

  for (const r of records) {
    const id = `wf_${pointKey}_${r.hour.getTime()}`;
    valueClauses.push(
      `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`
    );
    params.push(id, pointKey, r.hour, r.precipMm, r.precipProb, r.tempC);
  }

  const query = `
    INSERT INTO "WeatherForecast" (
      "id",
      "pointKey",
      "hour",
      "precipMm",
      "precipProb",
      "tempC",
      "fetchedAt"
    )
    VALUES ${valueClauses.join(", ")}
    ON CONFLICT ("pointKey", "hour") DO UPDATE
    SET "precipMm" = EXCLUDED."precipMm",
        "precipProb" = EXCLUDED."precipProb",
        "tempC" = EXCLUDED."tempC",
        "fetchedAt" = EXCLUDED."fetchedAt";
  `;

  await prisma.$executeRawUnsafe(query, ...params);

  return { pointKey, count: records.length };
}

export interface RainForecastSummary {
  pointKey: string;
  hoursEvaluated: number;
  maxPrecipProb: number;
  totalPrecipMm: number;
  isRainExpected: boolean;
}

/**
 * Retrieves aggregate rain forecast over the next N hours (default 24h) for a given pointKey.
 */
export async function getRainForecast(
  pointKey: string,
  hoursAhead: number = 24
): Promise<RainForecastSummary> {
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600 * 1000);

  const rows = await prisma.weatherForecast.findMany({
    where: {
      pointKey,
      hour: {
        gte: now,
        lte: until,
      },
    },
    orderBy: { hour: "asc" },
  });

  let maxPrecipProb = 0;
  let totalPrecipMm = 0;

  for (const r of rows) {
    if (r.precipProb > maxPrecipProb) {
      maxPrecipProb = r.precipProb;
    }
    totalPrecipMm += r.precipMm;
  }

  return {
    pointKey,
    hoursEvaluated: rows.length,
    maxPrecipProb,
    totalPrecipMm: Math.round(totalPrecipMm * 10) / 10,
    isRainExpected: maxPrecipProb >= 50 || totalPrecipMm >= 2.5,
  };
}
