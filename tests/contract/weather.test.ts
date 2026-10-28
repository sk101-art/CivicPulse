import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import {
  parseOpenMeteoPayload,
  WEATHER_ATTRIBUTION,
  OpenMeteoRawResponse,
} from "@/lib/external/openmeteo";
import { syncWeatherForecast, getRainForecast } from "@/lib/jobs/weather";

describe("T33 Contract Test: Open-Meteo Weather Adapter", () => {
  const testPointKey = "pilot-test-point-t33";
  let fixtureData: OpenMeteoRawResponse;

  beforeAll(async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "weather",
      "real-bangalore.json"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, "utf-8");
    fixtureData = JSON.parse(raw);

    // Clean any leftover test rows
    await prisma.weatherForecast.deleteMany({
      where: { pointKey: testPointKey },
    });
  });

  afterAll(async () => {
    await prisma.weatherForecast.deleteMany({
      where: { pointKey: testPointKey },
    });
  });

  it("exports correct Open-Meteo CC-BY attribution string", () => {
    expect(WEATHER_ATTRIBUTION).toBe("Weather data by Open-Meteo.com");
  });

  it("parses real Bengaluru Open-Meteo payload into 72 hourly records", () => {
    const records = parseOpenMeteoPayload(fixtureData);
    expect(records).toHaveLength(72);

    for (const r of records) {
      expect(r.hour).toBeInstanceOf(Date);
      expect(isNaN(r.hour.getTime())).toBe(false);
      expect(r.precipMm).toBeGreaterThanOrEqual(0);
      expect(r.precipProb).toBeGreaterThanOrEqual(0);
      expect(r.precipProb).toBeLessThanOrEqual(100);
      expect(typeof r.tempC).toBe("number");
    }
  });

  it("syncs 72 hourly forecast rows into WeatherForecast table idempotently", async () => {
    const records = parseOpenMeteoPayload(fixtureData);

    const result = await syncWeatherForecast(
      testPointKey,
      12.945,
      77.7,
      records
    );
    expect(result.count).toBe(72);
    expect(result.pointKey).toBe(testPointKey);

    const countInDb = await prisma.weatherForecast.count({
      where: { pointKey: testPointKey },
    });
    expect(countInDb).toBe(72);

    // Re-sync should update existing records without constraint violation
    const resync = await syncWeatherForecast(
      testPointKey,
      12.945,
      77.7,
      records
    );
    expect(resync.count).toBe(72);

    const countAfterResync = await prisma.weatherForecast.count({
      where: { pointKey: testPointKey },
    });
    expect(countAfterResync).toBe(72);
  });

  it("evaluates rain risk summary over next 24 hours", async () => {
    const summary = await getRainForecast(testPointKey, 24);
    expect(summary.pointKey).toBe(testPointKey);
    expect(typeof summary.maxPrecipProb).toBe("number");
    expect(typeof summary.totalPrecipMm).toBe("number");
    expect(typeof summary.isRainExpected).toBe("boolean");
  });
});
