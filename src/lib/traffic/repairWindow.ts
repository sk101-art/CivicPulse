import { prisma } from "@/lib/db/prisma";
import { getHourOfWeekIST } from "./congestion";

export interface RepairWindow {
  start: string; // ISO string
  end: string;   // ISO string
  display: string; // e.g. "Tue 01:00-03:00"
  dayOfWeek: string;
  timeRange: string;
  expectedCongestion: number;
  condition: string;
  basis: "live" | "estimated";
  sampleCount: number;
}

export interface RepairWindowResult {
  issueId: string;
  basis: "live" | "estimated";
  sampleCount: number;
  bestWindow: RepairWindow | null;
  windows: RepairWindow[];
  displayText: string;
}

/**
 * Returns a 168-hour fallback congestion profile (0 to 167) in IST.
 * Peak hours: 8-11 and 17-21 IST.
 * Night hours: 0-6 IST (lowest traffic).
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
    const hr = h % 24; // 0 to 23 in IST
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
export function formatIstTime(date: Date): { dayOfWeek: string; time: string; dateStr: string } {
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
  };
}

/**
 * Pure function: calculates the best 3 two-hour repair windows in the next 7 days.
 * Excludes hours on days with forecast rain >= 5.0 mm.
 */
export function computeRepairWindows(options: {
  issueId: string;
  roadClass?: string | null;
  samples: Array<{ hourOfWeek: number; congestionR: number }>;
  rainByDay: Map<string, number>; // dateStr (YYYY-MM-DD IST) -> total daily rain mm
  now?: Date;
}): RepairWindowResult {
  const { issueId, roadClass, samples, rainByDay } = options;
  const now = options.now ?? new Date();

  const totalSampleCount = samples.length;
  const basis: "live" | "estimated" = totalSampleCount > 0 ? "live" : "estimated";

  // Build 168-hour profile
  const fallbackProfile = getDefaultRoadClassProfile(roadClass);
  const hourBuckets: Map<number, number[]> = new Map();
  for (const s of samples) {
    if (s.hourOfWeek >= 0 && s.hourOfWeek < 168 && Number.isFinite(s.congestionR)) {
      const list = hourBuckets.get(s.hourOfWeek) ?? [];
      list.push(s.congestionR);
      hourBuckets.set(s.hourOfWeek, list);
    }
  }

  const profile: number[] = new Array(168);
  for (let h = 0; h < 168; h++) {
    const list = hourBuckets.get(h);
    if (list && list.length > 0) {
      const sum = list.reduce((a, b) => a + b, 0);
      profile[h] = Math.round((sum / list.length) * 1000) / 1000;
    } else {
      profile[h] = fallbackProfile[h];
    }
  }

  // Next 7 days candidate hours starting at next top-of-hour
  const startMs = Math.ceil(now.getTime() / (3600 * 1000)) * (3600 * 1000);
  const totalCandidateHours = 7 * 24; // 168 hours ahead

  interface CandidateWindow {
    startDate: Date;
    endDate: Date;
    avgCongestion: number;
    display: string;
    dayOfWeek: string;
    timeRange: string;
    dateStr: string;
  }

  const candidates: CandidateWindow[] = [];

  for (let i = 0; i <= totalCandidateHours - 2; i++) {
    const t1 = new Date(startMs + i * 3600 * 1000);
    const t2 = new Date(startMs + (i + 1) * 3600 * 1000);
    const tEnd = new Date(startMs + (i + 2) * 3600 * 1000);

    const f1 = formatIstTime(t1);
    const fEnd = formatIstTime(tEnd);

    // Rain exclusion rule: exclude hours on days with forecast rain >= 5 mm
    const dayRain1 = rainByDay.get(f1.dateStr) ?? 0;
    const f2 = formatIstTime(t2);
    const dayRain2 = rainByDay.get(f2.dateStr) ?? 0;

    if (dayRain1 >= 5.0 || dayRain2 >= 5.0) {
      continue; // Exclude due to rain on that day
    }

    const h1 = getHourOfWeekIST(t1);
    const h2 = getHourOfWeekIST(t2);
    const avgCongestion = Math.round(((profile[h1] + profile[h2]) / 2) * 1000) / 1000;

    const timeRange = `${f1.time}-${fEnd.time}`;
    candidates.push({
      startDate: t1,
      endDate: tEnd,
      avgCongestion,
      display: `${f1.dayOfWeek} ${timeRange}`,
      dayOfWeek: f1.dayOfWeek,
      timeRange,
      dateStr: f1.dateStr,
    });
  }

  // If heavy rain on every day left candidates empty, fallback to candidate windows without rain exclusion
  const pool = candidates;
  let isDryCondition = true;
  if (pool.length === 0) {
    isDryCondition = false;
    for (let i = 0; i <= totalCandidateHours - 2; i++) {
      const t1 = new Date(startMs + i * 3600 * 1000);
      const tEnd = new Date(startMs + (i + 2) * 3600 * 1000);
      const f1 = formatIstTime(t1);
      const fEnd = formatIstTime(tEnd);
      const h1 = getHourOfWeekIST(t1);
      const h2 = getHourOfWeekIST(new Date(t1.getTime() + 3600 * 1000));
      const avgCongestion = Math.round(((profile[h1] + profile[h2]) / 2) * 1000) / 1000;
      const timeRange = `${f1.time}-${fEnd.time}`;
      pool.push({
        startDate: t1,
        endDate: tEnd,
        avgCongestion,
        display: `${f1.dayOfWeek} ${timeRange}`,
        dayOfWeek: f1.dayOfWeek,
        timeRange,
        dateStr: f1.dateStr,
      });
    }
  }

  // Sort by congestion ascending, then earlier time
  pool.sort((a, b) => {
    if (a.avgCongestion !== b.avgCongestion) {
      return a.avgCongestion - b.avgCongestion;
    }
    return a.startDate.getTime() - b.startDate.getTime();
  });

  // Pick top 3 non-overlapping windows
  const selected: RepairWindow[] = [];
  for (const cand of pool) {
    if (selected.length >= 3) break;
    const candStart = cand.startDate.getTime();
    const candEnd = cand.endDate.getTime();

    // Check collision with already selected windows
    const overlaps = selected.some((s) => {
      const sStart = new Date(s.start).getTime();
      const sEnd = new Date(s.end).getTime();
      return candStart < sEnd && candEnd > sStart;
    });

    if (!overlaps) {
      const condition = `${cand.avgCongestion < 0.25 ? "low traffic" : cand.avgCongestion < 0.50 ? "moderate traffic" : "heavy traffic"}, ${isDryCondition ? "dry" : "rain likely"}`;

      selected.push({
        start: cand.startDate.toISOString(),
        end: cand.endDate.toISOString(),
        display: cand.display,
        dayOfWeek: cand.dayOfWeek,
        timeRange: cand.timeRange,
        expectedCongestion: cand.avgCongestion,
        condition,
        basis,
        sampleCount: totalSampleCount,
      });
    }
  }

  const bestWindow = selected[0] ?? null;

  let displayText: string;
  if (bestWindow) {
    displayText = `Best repair window: ${bestWindow.display} (${bestWindow.condition}) · based on ${totalSampleCount} samples · ${basis}`;
  } else {
    displayText = "No repair window available";
  }

  return {
    issueId,
    basis,
    sampleCount: totalSampleCount,
    bestWindow,
    windows: selected,
    displayText,
  };
}

/**
 * Computes repair window for an issue by querying its traffic samples and weather forecasts.
 */
export async function getRepairWindowForIssue(
  issueId: string,
  now: Date = new Date()
): Promise<RepairWindowResult | null> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      wardId: true,
      segment: { select: { roadClass: true } },
      trafficSamples: {
        select: { hourOfWeek: true, congestionR: true },
      },
    },
  });

  if (!issue) {
    return null;
  }

  // Fetch weather forecast in next 7 days for the issue's ward or pilot
  const pointKey = issue.wardId || "pilot";
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const weatherRows = await prisma.weatherForecast.findMany({
    where: {
      pointKey,
      hour: {
        gte: new Date(now.getTime() - 24 * 3600 * 1000), // include today
        lte: sevenDaysLater,
      },
    },
    select: { hour: true, precipMm: true },
  });

  // Aggregate rainfall by IST calendar day
  const rainByDay = new Map<string, number>();
  for (const w of weatherRows) {
    const { dateStr } = formatIstTime(w.hour);
    const curr = rainByDay.get(dateStr) ?? 0;
    rainByDay.set(dateStr, curr + w.precipMm);
  }

  return computeRepairWindows({
    issueId: issue.id,
    roadClass: issue.segment?.roadClass,
    samples: issue.trafficSamples,
    rainByDay,
    now,
  });
}
