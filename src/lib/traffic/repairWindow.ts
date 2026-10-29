import "server-only";
import { prisma } from "@/lib/db/prisma";
import { DayType } from "@prisma/client";
import { getHourOfWeekIST } from "./congestion";
import {
  getSurroundingsAndRoadInfo,
  SurroundingsResult,
} from "@/lib/external/overpass";
import {
  getTomTomTrafficIncidents,
  TrafficIncidentsResult,
} from "@/lib/external/tomtom";

export interface SlotFactorBreakdown {
  trafficScore: number;       // 0-100 (weight 40%)
  weatherScore: number;       // 0-100 (weight 25%)
  surroundingsScore: number;  // 0-100 (weight 20%)
  crewScore: number;          // 0-100 (weight 15%)
}

export interface LaneClosureDetails {
  direction: string;                   // e.g. "Northbound"
  blockedLane: string;                 // e.g. "Northbound curb lane"
  remainingLanes: number;              // e.g. 2
  totalLanes: number;                  // e.g. 3
  lanePosition: string;                // e.g. "CURB"
  estimatedQueueDelayMin: string;      // e.g. "< 3 min"
  capacityDropPercent: number;         // e.g. 33
}

export interface RepairWindow {
  start: string;                       // ISO string
  end: string;                         // ISO string
  startIso?: string;
  endIso?: string;
  windowType?: "NIGHT" | "DAY_OFF_PEAK" | "DAY_PEAK" | "WEEKEND_DAY";
  delayRatio?: number;
  display: string;                     // e.g. "Tue 23:00-01:00"
  dayOfWeek: string;                   // e.g. "Tue"
  timeRange: string;                   // e.g. "23:00-01:00"
  score: number;                       // 0-100 composite score
  expectedCongestion: number;          // 0..1 (avg delay ratio)
  condition: string;                   // e.g. "low traffic, dry"
  basis: "live" | "estimated";
  sampleCount: number;
  factors: SlotFactorBreakdown;
  laneClosure: LaneClosureDetails;
  explanation: string;
  urgencyBoosted?: boolean;
}

export interface CandidateSlot extends RepairWindow {
  slotIndex: number; // 0..83
}

export interface RepairWindowResult {
  issueId: string;
  basis: "live" | "estimated";
  sampleCount: number;
  bestWindow: RepairWindow | null;
  windows: RepairWindow[];             // Top 3 non-overlapping windows
  allSlots: CandidateSlot[];           // Full 84 two-hour candidate slots
  displayText: string;
  roadInfo?: {
    lanes: number;
    oneway: boolean;
    name?: string;
  };
  surroundings?: {
    nearestSchoolDistM?: number;
    nearestHospitalDistM?: number;
    nearestMarketDistM?: number;
  };
  incidents?: string[];
}

/**
 * Returns a 168-hour fallback congestion profile (0 to 167) in IST.
 */
export function getDefaultRoadClassProfile(roadClass?: string | null): number[] {
  const rc = (roadClass || "residential").toLowerCase();
  let baseNight = 0.05;
  let morningPeak = 0.50;
  let eveningPeak = 0.55;
  let midday = 0.20;
  let transition = 0.15;

  if (rc === "trunk" || rc === "primary") {
    baseNight = 0.10;
    morningPeak = 0.80;
    eveningPeak = 0.85;
    midday = 0.45;
    transition = 0.30;
  } else if (rc === "secondary") {
    baseNight = 0.08;
    morningPeak = 0.70;
    eveningPeak = 0.75;
    midday = 0.35;
    transition = 0.25;
  } else if (rc === "tertiary") {
    baseNight = 0.06;
    morningPeak = 0.60;
    eveningPeak = 0.65;
    midday = 0.28;
    transition = 0.20;
  }

  const profile: number[] = new Array(168);
  for (let h = 0; h < 168; h++) {
    const hr = h % 24;
    if (hr >= 8 && hr < 11) {
      profile[h] = morningPeak;
    } else if (hr >= 17 && hr < 21) {
      profile[h] = eveningPeak;
    } else if (hr >= 0 && hr < 6) {
      profile[h] = baseNight;
    } else if (hr >= 11 && hr < 17) {
      profile[h] = midday;
    } else {
      profile[h] = transition;
    }
  }

  return profile;
}

/**
 * Formats a Date into IST Day ("Mon", "Tue", etc.) and time string "HH:00".
 */
export function formatIstTime(date: Date): {
  dayOfWeek: string;
  time: string;
  dateStr: string;
  hour: number;
} {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const ist = new Date(date.getTime() + istOffsetMs);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeek = days[ist.getUTCDay()];
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const yyyy = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");

  return {
    dayOfWeek,
    time: `${hh}:${mm}`,
    dateStr: `${yyyy}-${month}-${dd}`,
    hour: ist.getUTCHours(),
  };
}

/**
 * Maps compass bearing in degrees (0-359) to 8-point direction name.
 */
export function getCompassDirection(bearingDeg: number): string {
  const norm = ((bearingDeg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return "Northbound";
  if (norm >= 22.5 && norm < 67.5) return "Northeastbound";
  if (norm >= 67.5 && norm < 112.5) return "Eastbound";
  if (norm >= 112.5 && norm < 157.5) return "Southeastbound";
  if (norm >= 157.5 && norm < 202.5) return "Southbound";
  if (norm >= 202.5 && norm < 247.5) return "Southwestbound";
  if (norm >= 247.5 && norm < 292.5) return "Westbound";
  return "Northwestbound";
}

/**
 * Pure function: calculates 84 two-hour candidate slots and selects the best 3
 * using the multi-factor scoring model and lane-closure impact analysis.
 */
export function computeMultiFactorRepairWindows(options: {
  issueId: string;
  lanePosition?: string | null;
  bearingDeg?: number;
  priorityIndex?: number;
  roadClass?: string | null;
  deteriorationRisk?: "LOW" | "MED" | "HIGH";
  wardCrewHoursMode?: "DAY_ONLY" | "NIGHT_ONLY" | "STANDARD" | "ANY";
  hourlyProfiles?: Map<string, number>; // key: `${dayType}-${hour}` -> delayRatio
  hourlyWeather?: Map<string, { precipMm: number; precipProb: number; tempC: number }>; // key: ISO string hour
  surroundings?: SurroundingsResult;
  incidentsResult?: TrafficIncidentsResult;
  sampleCount?: number;
  now?: Date;
}): RepairWindowResult {
  const {
    issueId,
    lanePosition = "CURB",
    bearingDeg = 0,
    priorityIndex = 50,
    roadClass,
    deteriorationRisk = "LOW",
    wardCrewHoursMode = "STANDARD",
    hourlyProfiles = new Map(),
    hourlyWeather = new Map(),
    surroundings,
    incidentsResult,
    sampleCount = 0,
  } = options;

  const safeSurroundings: SurroundingsResult = surroundings || {
    schools: [],
    hospitals: [],
    markets: [],
    road: {
      highway: "secondary",
      lanes: 2,
      oneway: false,
    },
    cached: false,
    source: "fallback",
  };

  const now = options.now ?? new Date();
  const basis: "live" | "estimated" = sampleCount > 0 ? "live" : "estimated";

  // Road characterization
  const rc = (roadClass || safeSurroundings.road.highway || "residential").toLowerCase();
  const frc = (safeSurroundings.road.frc || "").toUpperCase();
  const isResidential =
    rc === "residential" ||
    rc === "living_street" ||
    rc === "service" ||
    rc === "unclassified" ||
    frc === "FRC4" ||
    frc === "FRC5" ||
    frc === "FRC6" ||
    frc === "FRC7" ||
    safeSurroundings.road.highway === "residential";

  const totalLanes = Math.max(1, safeSurroundings.road.lanes || 2);
  const isHighSpeed =
    ["trunk", "primary", "motorway"].includes(rc) ||
    ["FRC0", "FRC1", "FRC2"].includes(frc) ||
    totalLanes >= 4;

  // Lane and Direction modeling
  const forwardDir = getCompassDirection(bearingDeg);
  const oneway = safeSurroundings.road.oneway;
  const direction = forwardDir;

  const normPos = (lanePosition || "CURB").toUpperCase();
  let blockedLaneDesc = `${direction} curb lane`;
  let remainingLanes = Math.max(1, totalLanes - 1);
  let capacityDropPercent = Math.round(((totalLanes - remainingLanes) / totalLanes) * 100);

  if (normPos === "CENTER") {
    blockedLaneDesc = `${direction} center lane`;
    remainingLanes = Math.max(1, totalLanes - 1);
    capacityDropPercent = Math.round(((totalLanes - remainingLanes) / totalLanes) * 100);
  } else if (normPos === "SHOULDER") {
    blockedLaneDesc = `${direction} shoulder`;
    remainingLanes = totalLanes;
    capacityDropPercent = 0;
  } else if (normPos === "UNKNOWN") {
    blockedLaneDesc = `${direction} outer lane`;
    remainingLanes = Math.max(1, totalLanes - 1);
    capacityDropPercent = Math.round(((totalLanes - remainingLanes) / totalLanes) * 100);
  }

  // Next 7 days candidate hours starting at next top-of-hour
  const startMs = Math.ceil(now.getTime() / (3600 * 1000)) * (3600 * 1000);
  const totalSlots = 84; // 84 * 2h = 168h = 7 days
  const isUrgent = priorityIndex >= 80 || deteriorationRisk === "HIGH";

  const allSlots: CandidateSlot[] = [];

  for (let slotIdx = 0; slotIdx < totalSlots; slotIdx++) {
    const tStart = new Date(startMs + slotIdx * 2 * 3600 * 1000);
    const tMid = new Date(startMs + (slotIdx * 2 + 1) * 3600 * 1000);
    const tEnd = new Date(startMs + (slotIdx * 2 + 2) * 3600 * 1000);

    const fStart = formatIstTime(tStart);
    const fMid = formatIstTime(tMid);
    const fEnd = formatIstTime(tEnd);

    const dayType =
      fStart.dayOfWeek === "Sat" || fStart.dayOfWeek === "Sun"
        ? DayType.WEEKEND
        : DayType.WEEKDAY;

    // 1. Traffic Factor (40%)
    const delay1 = hourlyProfiles.get(`${dayType}-${fStart.hour}`) ?? 0.15;
    const delay2 = hourlyProfiles.get(`${dayType}-${fMid.hour}`) ?? 0.15;
    const avgDelayRatio = Math.round(((delay1 + delay2) / 2) * 100) / 100;
    // Lower delay = higher score (0 delay -> 100; 0.75+ delay -> 0)
    const trafficScore = Math.max(
      0,
      Math.min(100, Math.round(100 * (1 - avgDelayRatio / 0.75)))
    );

    // 2. Weather Factor (25%)
    const w1Key = new Date(tStart.getTime()).toISOString().slice(0, 13) + ":00:00.000Z";
    const w2Key = new Date(tMid.getTime()).toISOString().slice(0, 13) + ":00:00.000Z";
    const w1 = hourlyWeather.get(w1Key) ?? { precipMm: 0, precipProb: 0, tempC: 24 };
    const w2 = hourlyWeather.get(w2Key) ?? { precipMm: 0, precipProb: 0, tempC: 24 };

    const maxPrecip = Math.max(w1.precipMm, w2.precipMm);
    const maxProb = Math.max(w1.precipProb, w2.precipProb);
    const avgTemp = Math.round((w1.tempC + w2.tempC) / 2);

    let weatherScore = 85;
    if (maxPrecip > 5.0 || maxProb > 70) {
      weatherScore = 0; // Heavy rain rule
    } else if (maxPrecip > 1.0 || maxProb > 40) {
      weatherScore = 30;
    } else if (maxPrecip > 0 || maxProb > 20) {
      weatherScore = 60;
    } else {
      // Dry condition
      const isNight = fStart.hour >= 22 || fStart.hour < 6;
      if (isNight && avgTemp >= 18 && avgTemp <= 28) {
        weatherScore = 100; // Perfect dry night
      } else if (!isNight && avgTemp >= 18 && avgTemp <= 32) {
        weatherScore = 90;
      } else if (avgTemp > 34) {
        weatherScore = 75;
      }
    }

    // 3. Surroundings Factor (20%)
    let surroundingsScore = 100;
    let schoolStatusText = "";
    let hospitalStatusText = "";

    // School check (< 200m)
    if (safeSurroundings.nearestSchool && safeSurroundings.nearestSchool.distanceM <= 200) {
      const dist = safeSurroundings.nearestSchool.distanceM;
      const isSchoolHour =
        dayType === DayType.WEEKDAY &&
        ((fStart.hour >= 7 && fStart.hour < 10) || (fStart.hour >= 14 && fStart.hour < 16));

      if (isSchoolHour) {
        surroundingsScore -= 40;
        schoolStatusText = `School ${dist} m away is active (school zone traffic).`;
      } else {
        schoolStatusText = `School ${dist} m away is closed.`;
      }
    }

    // Hospital check (< 200m)
    if (safeSurroundings.nearestHospital && safeSurroundings.nearestHospital.distanceM <= 200) {
      const dist = safeSurroundings.nearestHospital.distanceM;
      const isNight = fStart.hour >= 22 || fStart.hour < 6;
      if (isNight) {
        surroundingsScore -= 50; // Noise restriction for heavy machinery/jackhammers
        hospitalStatusText = `Hospital ${dist} m away — heavy noise restricted.`;
      } else {
        hospitalStatusText = `Hospital ${dist} m away (emergency access maintained).`;
      }
    }

    // Market check (< 200m)
    if (safeSurroundings.nearestMarket && safeSurroundings.nearestMarket.distanceM <= 200) {
      const isMarketHour = fStart.hour >= 17 && fStart.hour < 21;
      if (isMarketHour) {
        surroundingsScore -= 40;
      }
    }
    surroundingsScore = Math.max(0, surroundingsScore);

    // 4. Crew Hours Factor (15%)
    let crewScore = 100;
    const isNightShift = fStart.hour >= 22 || fStart.hour < 5;
    const isDayShift = fStart.hour >= 7 && fStart.hour < 19;
    const isShiftChange = (fStart.hour >= 5 && fStart.hour < 7) || (fStart.hour >= 19 && fStart.hour < 22);

    if (wardCrewHoursMode === "DAY_ONLY") {
      crewScore = isDayShift ? 100 : 0;
    } else if (wardCrewHoursMode === "NIGHT_ONLY") {
      crewScore = isNightShift ? 100 : 0;
    } else if (wardCrewHoursMode === "ANY") {
      crewScore = 100;
    } else {
      // STANDARD: allow NIGHT 22-05 and DAY 07-19, penalize shift change
      if (isNightShift || isDayShift) {
        crewScore = 100;
      } else if (isShiftChange) {
        crewScore = 30;
      }
    }

    // Composite Score with realistic night-work costs & continuous differentiation
    const isNight = fStart.hour >= 22 || fStart.hour < 6;
    let rawCompositeScore = (
      0.40 * trafficScore +
      0.25 * weatherScore +
      0.20 * surroundingsScore +
      0.15 * crewScore
    );

    // Realistic night-work penalties:
    if (isNight) {
      rawCompositeScore -= 15; // Night crew cost premium (-15)
      if (isHighSpeed) {
        rawCompositeScore -= 10; // Worker-safety penalty on high-speed roads at night (-10)
      }
      if (isResidential) {
        rawCompositeScore -= 35; // Residential noise penalty 22:00-06:00 (-35)
      }
    }

    // Urgency override: if priority index >= 80 or high deterioration, boost next 24h slots
    const isWithinNext24h = slotIdx < 12; // first 12 two-hour slots = 24h
    let urgencyBoosted = false;
    if (isUrgent && isWithinNext24h && weatherScore > 0) {
      rawCompositeScore += 18;
      urgencyBoosted = true;
    }

    // Continuous score: differentiate by exact delay ratio so identical scores do not saturate
    const delayPenalty = (avgDelayRatio * 6) + (capacityDropPercent > 0 ? 1.5 : 0);
    rawCompositeScore = Math.max(5, rawCompositeScore - delayPenalty);
    // Continuous score with 1 decimal precision, no clamping at 100
    const compositeScore = Math.round(rawCompositeScore * 10) / 10;

    // Queue Delay Estimation
    let queueDelayMin = "< 3 min";
    if (capacityDropPercent > 0) {
      if (avgDelayRatio > 0.50) {
        queueDelayMin = "> 20 min";
      } else if (avgDelayRatio > 0.35) {
        queueDelayMin = "12-18 min";
      } else if (avgDelayRatio > 0.20) {
        queueDelayMin = "6-10 min";
      } else if (avgDelayRatio > 0.08) {
        queueDelayMin = "3-5 min";
      } else {
        queueDelayMin = "< 3 min";
      }
    } else {
      queueDelayMin = "< 1 min";
    }

    const laneClosure: LaneClosureDetails = {
      direction,
      blockedLane: blockedLaneDesc,
      remainingLanes,
      totalLanes,
      lanePosition: normPos,
      estimatedQueueDelayMin: queueDelayMin,
      capacityDropPercent,
    };

    // Build human explanation
    const timeDisplay = `${fStart.dayOfWeek} ${fStart.time}-${fEnd.time}`;
    const trafficDesc =
      avgDelayRatio < 0.08
        ? `Lowest traffic (delay ${Math.round(avgDelayRatio * 100)}%)`
        : avgDelayRatio < 0.25
        ? `Moderate traffic (delay ${Math.round(avgDelayRatio * 100)}%)`
        : `High traffic (delay ${Math.round(avgDelayRatio * 100)}%)`;

    const rainDesc =
      maxPrecip === 0
        ? `no rain (0 mm, ${avgTemp} C)`
        : `${maxPrecip.toFixed(1)} mm rain (${maxProb}% prob, ${avgTemp} C)`;

    let closureText = `Recommended closure: ${blockedLaneDesc}; ${remainingLanes} of ${totalLanes} lanes remain open, estimated queue delay ${queueDelayMin}.`;

    const surroundingParts: string[] = [];
    if (schoolStatusText) surroundingParts.push(schoolStatusText);
    if (hospitalStatusText) surroundingParts.push(hospitalStatusText);
    const surroundingText = surroundingParts.length > 0 ? ` ${surroundingParts.join(" ")}` : "";

    let incidentText = "";
    if (incidentsResult && incidentsResult.hasNearbyIncident) {
      incidentText = " Congestion already present nearby.";
    }

    const explanation = `${timeDisplay} (score ${compositeScore}/100): ${trafficDesc}, ${rainDesc}. ${closureText}${surroundingText}${incidentText}`.trim();

    const condition = `${avgDelayRatio < 0.20 ? "low traffic" : avgDelayRatio < 0.45 ? "moderate traffic" : "heavy traffic"}, ${maxPrecip > 0 ? "rain likely" : "dry"}`;

    const isWeekendDay = dayType === DayType.WEEKEND && !isNight;
    const isPeak =
      dayType === DayType.WEEKDAY &&
      ((fStart.hour >= 8 && fStart.hour < 11) || (fStart.hour >= 17 && fStart.hour < 21));
    const windowType: "NIGHT" | "DAY_OFF_PEAK" | "DAY_PEAK" | "WEEKEND_DAY" =
      isNight
        ? "NIGHT"
        : (isWeekendDay ? "WEEKEND_DAY" : (isPeak ? "DAY_PEAK" : "DAY_OFF_PEAK"));

    allSlots.push({
      slotIndex: slotIdx,
      start: tStart.toISOString(),
      end: tEnd.toISOString(),
      startIso: tStart.toISOString(),
      endIso: tEnd.toISOString(),
      windowType,
      delayRatio: avgDelayRatio,
      display: timeDisplay,
      dayOfWeek: fStart.dayOfWeek,
      timeRange: `${fStart.time}-${fEnd.time}`,
      score: compositeScore,
      expectedCongestion: avgDelayRatio,
      condition,
      basis,
      sampleCount,
      factors: {
        trafficScore,
        weatherScore,
        surroundingsScore,
        crewScore,
      },
      laneClosure,
      explanation,
      urgencyBoosted,
    });
  }

  // Sort candidate slots: highest score first, then lowest lane-closure queue delay / congestion, then sooner start time
  const sorted = [...allSlots].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.05) {
      return b.score - a.score;
    }
    if (a.expectedCongestion !== b.expectedCongestion) {
      return a.expectedCongestion - b.expectedCongestion;
    }
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  // Pick top 3 non-overlapping windows
  const selected: RepairWindow[] = [];
  for (const slot of sorted) {
    if (selected.length >= 3) break;
    const sStart = new Date(slot.start).getTime();
    const sEnd = new Date(slot.end).getTime();

    const overlaps = selected.some((s) => {
      const existStart = new Date(s.start).getTime();
      const existEnd = new Date(s.end).getTime();
      return sStart < existEnd && sEnd > existStart;
    });

    if (!overlaps) {
      selected.push(slot);
    }
  }

  const bestWindow = selected[0] ?? null;

  let displayText: string;
  if (bestWindow) {
    displayText = `Best repair window: ${bestWindow.display} (score ${bestWindow.score}/100) · ${bestWindow.condition} · based on ${sampleCount} samples · ${basis}`;
  } else {
    displayText = "No repair window available";
  }

  return {
    issueId,
    basis,
    sampleCount,
    bestWindow,
    windows: selected,
    allSlots,
    displayText,
    roadInfo: {
      lanes: totalLanes,
      oneway,
      name: safeSurroundings.road?.name,
    },
    surroundings: {
      nearestSchoolDistM: safeSurroundings.nearestSchool?.distanceM,
      nearestHospitalDistM: safeSurroundings.nearestHospital?.distanceM,
      nearestMarketDistM: safeSurroundings.nearestMarket?.distanceM,
    },
    incidents: incidentsResult?.incidents?.map((i) => i.description) || [],
  };
}

/**
 * Backwards-compatible pure function: calculates repair windows from sample and rain map.
 */
export function computeRepairWindows(options: {
  issueId: string;
  roadClass?: string | null;
  samples: Array<{ hourOfWeek: number; congestionR: number }>;
  rainByDay: Map<string, number>;
  now?: Date;
}): RepairWindowResult {
  const { issueId, roadClass, samples, rainByDay } = options;
  const now = options.now ?? new Date();

  const fallbackProfile = getDefaultRoadClassProfile(roadClass);
  const hourBuckets: Map<number, number[]> = new Map();
  for (const s of samples) {
    if (s.hourOfWeek >= 0 && s.hourOfWeek < 168 && Number.isFinite(s.congestionR)) {
      const list = hourBuckets.get(s.hourOfWeek) ?? [];
      list.push(s.congestionR);
      hourBuckets.set(s.hourOfWeek, list);
    }
  }

  const hourlyProfiles = new Map<string, number>();
  for (let h = 0; h < 168; h++) {
    const list = hourBuckets.get(h);
    const day = Math.floor(h / 24);
    const hour = h % 24;
    const dayType = day === 0 || day === 6 ? DayType.WEEKEND : DayType.WEEKDAY;
    const val =
      list && list.length > 0
        ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 1000) / 1000
        : fallbackProfile[h];
    hourlyProfiles.set(`${dayType}-${hour}`, val);
  }

  // Synthesize hourly weather from rainByDay
  const hourlyWeather = new Map<string, { precipMm: number; precipProb: number; tempC: number }>();
  const startMs = Math.ceil(now.getTime() / (3600 * 1000)) * (3600 * 1000);
  for (let i = 0; i < 168; i++) {
    const t = new Date(startMs + i * 3600 * 1000);
    const f = formatIstTime(t);
    const dayRain = rainByDay.get(f.dateStr) ?? 0;
    const key = t.toISOString().slice(0, 13) + ":00:00.000Z";
    hourlyWeather.set(key, {
      precipMm: dayRain >= 5.0 ? 8.0 : dayRain > 0 ? 1.0 : 0.0,
      precipProb: dayRain >= 5.0 ? 85 : dayRain > 0 ? 30 : 0,
      tempC: 24,
    });
  }

  const mockSurroundings: SurroundingsResult = {
    schools: [],
    hospitals: [],
    markets: [],
    road: {
      lanes: 2,
      oneway: false,
    },
    cached: true,
    source: "fallback",
  };

  return computeMultiFactorRepairWindows({
    issueId,
    lanePosition: "CURB",
    bearingDeg: 0,
    priorityIndex: 50,
    hourlyProfiles,
    hourlyWeather,
    surroundings: mockSurroundings,
    sampleCount: samples.length,
    now,
  });
}

/**
 * Computes repair window for an issue by querying its traffic samples,
 * place traffic profiles, weather forecasts, Overpass surroundings, and incidents.
 */
export async function getRepairWindowForIssue(
  issueId: string,
  now: Date = new Date()
): Promise<RepairWindowResult | null> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      lat: true,
      lng: true,
      priority: true,
      wardId: true,
      segmentId: true,
      lanePosition: true,
      segment: { select: { roadClass: true, lanes: true } },
      trafficSamples: {
        select: { hourOfWeek: true, congestionR: true },
      },
      trafficProfiles: {
        select: { dayType: true, hour: true, delayRatio: true },
      },
    },
  });

  if (!issue) {
    return null;
  }

  // 1. Gather hourly profile map
  const hourlyProfiles = new Map<string, number>();
  if (issue.trafficProfiles && issue.trafficProfiles.length > 0) {
    for (const p of issue.trafficProfiles) {
      hourlyProfiles.set(`${p.dayType}-${p.hour}`, p.delayRatio);
    }
  } else {
    const fallbackProfile = getDefaultRoadClassProfile(issue.segment?.roadClass);
    for (let h = 0; h < 168; h++) {
      const day = Math.floor(h / 24);
      const hour = h % 24;
      const dayType = day === 0 || day === 6 ? DayType.WEEKEND : DayType.WEEKDAY;
      hourlyProfiles.set(`${dayType}-${hour}`, fallbackProfile[h]);
    }
  }

  // 2. Fetch Weather Forecasts
  const pointKey = issue.wardId || "pilot";
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const weatherRows = await prisma.weatherForecast.findMany({
    where: {
      pointKey,
      hour: {
        gte: new Date(now.getTime() - 24 * 3600 * 1000),
        lte: sevenDaysLater,
      },
    },
    select: { hour: true, precipMm: true, precipProb: true, tempC: true },
  });

  const hourlyWeather = new Map<string, { precipMm: number; precipProb: number; tempC: number }>();
  for (const w of weatherRows) {
    const key = w.hour.toISOString().slice(0, 13) + ":00:00.000Z";
    hourlyWeather.set(key, {
      precipMm: w.precipMm,
      precipProb: w.precipProb,
      tempC: w.tempC,
    });
  }

  // 3. Query Overpass Surroundings and Road Details
  const surroundings = await getSurroundingsAndRoadInfo(issue.lat, issue.lng, 500);

  // 4. Query TomTom Incidents (500m bbox)
  const incidents = await getTomTomTrafficIncidents(issue.lat, issue.lng, 500);

  return computeMultiFactorRepairWindows({
    issueId: issue.id,
    lanePosition: issue.lanePosition,
    bearingDeg: 0,
    priorityIndex: issue.priority ?? 50,
    roadClass: issue.segment?.roadClass,
    hourlyProfiles,
    hourlyWeather,
    surroundings,
    incidentsResult: incidents,
    sampleCount: issue.trafficSamples?.length || 0,
    now,
  });
}
