import { PriorityConfig } from "@/config/priority";

export type SeasonIST = "summer" | "sw_monsoon" | "ne_monsoon" | "winter";

/**
 * Determines the climatic season in Indian Standard Time (IST, UTC+5:30).
 * - Summer: March to May (Months 3..5)
 * - SW Monsoon: June to September (Months 6..9)
 * - NE Monsoon: October to December (Months 10..12)
 * - Winter: January to February (Months 1..2)
 */
export function getSeasonIST(date: Date): SeasonIST {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const istMonth = istDate.getUTCMonth() + 1; // 1 = January, 12 = December

  if (istMonth >= 3 && istMonth <= 5) return "summer";
  if (istMonth >= 6 && istMonth <= 9) return "sw_monsoon";
  if (istMonth >= 10 && istMonth <= 12) return "ne_monsoon";
  return "winter";
}

export interface SeasonFactorInputs {
  category: string;
  now?: Date;
  forecastRainMm72h?: number;
  isEventDay?: boolean;
}

/**
 * Computes Σ Season factor based on category, IST month, rainfall forecast, and events.
 * Formula: min(1.8, matrix[category][season] × rain × event)
 */
export function computeSeasonFactor(
  inputs: SeasonFactorInputs,
  config: PriorityConfig
): { seasonFactor: number; season: SeasonIST; rainMultiplier: number; eventMultiplier: number } {
  const now = inputs.now || new Date();
  const season = getSeasonIST(now);

  const categoryMatrix = config.seasonMatrix[inputs.category];
  const baseMultiplier = categoryMatrix ? categoryMatrix[season] : 1.0;

  const isWaterSensitive = config.season.waterSensitiveCategories.has(inputs.category);
  const rainForecast = inputs.forecastRainMm72h ?? 0;
  const rainMultiplier =
    isWaterSensitive && rainForecast > config.season.rainThresholdMm
      ? config.season.rainMultiplier
      : 1.0;

  const eventMultiplier = inputs.isEventDay ? config.season.eventMultiplier : 1.0;

  const rawMultiplier = baseMultiplier * rainMultiplier * eventMultiplier;
  const seasonFactor = Math.min(config.season.maxMultiplier, rawMultiplier);

  return {
    seasonFactor: Math.round(seasonFactor * 1000) / 1000,
    season,
    rainMultiplier,
    eventMultiplier,
  };
}
