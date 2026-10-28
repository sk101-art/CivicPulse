/**
 * Open-Meteo Weather API Adapter
 * Documentation: https://open-meteo.com/en/docs
 * Attribution required by Open-Meteo terms: "Weather data by Open-Meteo.com"
 */

export const WEATHER_ATTRIBUTION = "Weather data by Open-Meteo.com";

export interface HourlyWeatherRecord {
  hour: Date;
  precipMm: number;
  precipProb: number;
  tempC: number;
}

export interface OpenMeteoRawResponse {
  latitude: number;
  longitude: number;
  utc_offset_seconds: number;
  timezone: string;
  hourly: {
    time: string[];
    precipitation: number[];
    precipitation_probability: number[];
    temperature_2m: number[];
  };
}

/**
 * Parses raw Open-Meteo API payload into typed hourly weather records.
 */
export function parseOpenMeteoPayload(
  payload: OpenMeteoRawResponse
): HourlyWeatherRecord[] {
  const { hourly, utc_offset_seconds = 19800 } = payload;
  if (!hourly || !hourly.time || !Array.isArray(hourly.time)) {
    return [];
  }

  const offsetSign = utc_offset_seconds >= 0 ? "+" : "-";
  const absOffsetM = Math.abs(utc_offset_seconds) / 60;
  const offsetHours = String(Math.floor(absOffsetM / 60)).padStart(2, "0");
  const offsetMinutes = String(absOffsetM % 60).padStart(2, "0");
  const tzSuffix = `${offsetSign}${offsetHours}:${offsetMinutes}`;

  const records: HourlyWeatherRecord[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const rawTime = hourly.time[i];
    const dateStr =
      rawTime.includes("Z") ||
      rawTime.includes("+") ||
      (rawTime.lastIndexOf("-") > 8 && rawTime.lastIndexOf("-") === rawTime.length - 6)
        ? rawTime
        : `${rawTime}${tzSuffix}`;

    const hour = new Date(dateStr);
    records.push({
      hour,
      precipMm: Number(hourly.precipitation?.[i] ?? 0),
      precipProb: Number(hourly.precipitation_probability?.[i] ?? 0),
      tempC: Number(hourly.temperature_2m?.[i] ?? 0),
    });
  }

  return records;
}

/**
 * Fetches 72-hour forecast from Open-Meteo for given coordinates.
 */
export async function fetchOpenMeteoForecast(
  lat: number,
  lng: number,
  days: number = 3
): Promise<HourlyWeatherRecord[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,precipitation_probability,temperature_2m&forecast_days=${days}&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo forecast API returned status HTTP ${res.status}`);
  }

  const data = (await res.json()) as OpenMeteoRawResponse;
  return parseOpenMeteoPayload(data);
}
