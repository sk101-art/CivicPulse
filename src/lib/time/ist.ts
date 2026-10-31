/**
 * Centralized India Standard Time (IST, UTC+05:30) helper.
 * Indian Standard Time does not observe daylight saving time (fixed UTC+05:30 year-round).
 *
 * All time calculations, date comparisons, hourly profile lookups, and user-facing
 * date/time formatting must use these helpers to prevent server-timezone drift on Vercel (UTC).
 */

export const TIMEZONE_IST = "Asia/Kolkata";
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19,800,000 ms

export type DayTypeString = "WEEKDAY" | "WEEKEND";

/**
 * Returns current Date object.
 */
export function nowIST(): Date {
  return new Date();
}

/**
 * Coerces any supported date input into a valid Date object.
 */
export function toDate(input?: Date | string | number | null): Date {
  if (!input) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Extracts wall-clock calendar and time components in Asia/Kolkata (IST).
 */
export function getISTComponents(input?: Date | string | number | null): {
  year: number;
  month: number; // 1-12
  date: number; // 1-31
  hours: number; // 0-23
  minutes: number; // 0-59
  seconds: number; // 0-59
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayName: string; // 'Sun', 'Mon', etc.
  dayType: DayTypeString;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
} {
  const d = toDate(input);
  // Using pure offset math for 100% deterministic, high-speed wall-clock components
  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1;
  const date = istDate.getUTCDate();
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const seconds = istDate.getUTCSeconds();
  const dayOfWeek = istDate.getUTCDay();

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = dayNames[dayOfWeek] || "Sun";
  const dayType: DayTypeString = dayOfWeek === 0 || dayOfWeek === 6 ? "WEEKEND" : "WEEKDAY";

  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(date).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const min = String(minutes).padStart(2, "0");

  return {
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    dayOfWeek,
    dayName,
    dayType,
    dateStr: `${yyyy}-${mm}-${dd}`,
    timeStr: `${hh}:${min}`,
  };
}

/**
 * Returns the current hour in IST (0-23).
 */
export function getHourIST(input?: Date | string | number | null): number {
  return getISTComponents(input).hours;
}

/**
 * Returns the minute in IST (0-59).
 */
export function getMinuteIST(input?: Date | string | number | null): number {
  return getISTComponents(input).minutes;
}

/**
 * Returns the day of the week in IST (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
export function getDayIST(input?: Date | string | number | null): number {
  return getISTComponents(input).dayOfWeek;
}

/**
 * Returns the day type in IST ('WEEKDAY' or 'WEEKEND').
 */
export function getDayTypeIST(input?: Date | string | number | null): DayTypeString {
  return getISTComponents(input).dayType;
}

/**
 * Returns whether the given date is a weekend (Saturday or Sunday) in IST.
 */
export function isWeekendIST(input?: Date | string | number | null): boolean {
  const dow = getDayIST(input);
  return dow === 0 || dow === 6;
}

/**
 * Returns the hour-of-the-week in IST (0 to 167), starting Sunday 00:00.
 */
export function getHourOfWeekIST(input?: Date | string | number | null): number {
  const comp = getISTComponents(input);
  return comp.dayOfWeek * 24 + comp.hours;
}

/**
 * Formats date as ISO string with explicit IST +05:30 offset: YYYY-MM-DDTHH:mm:ss+05:30
 */
export function formatDepartAtIST(input?: Date | string | number | null): string {
  const comp = getISTComponents(input);
  const ss = String(comp.seconds).padStart(2, "0");
  return `${comp.dateStr}T${comp.timeStr}:${ss}+05:30`;
}

/**
 * Formats a date into a localized date string in Asia/Kolkata.
 */
export function formatDateIST(
  input?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = toDate(input);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE_IST,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  };
  return d.toLocaleDateString("en-IN", defaultOptions);
}

/**
 * Formats a date into a localized time string in Asia/Kolkata.
 */
export function formatTimeIST(
  input?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = toDate(input);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE_IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  };
  return d.toLocaleTimeString("en-IN", defaultOptions);
}

/**
 * Formats a date and time into a localized string in Asia/Kolkata.
 */
export function formatDateTimeIST(
  input?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = toDate(input);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE_IST,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  };
  return d.toLocaleString("en-IN", defaultOptions);
}

/**
 * Returns the start of day in IST (00:00:00.000 IST) as a standard Date object.
 */
export function startOfDayIST(input?: Date | string | number | null): Date {
  const comp = getISTComponents(input);
  // Construct UTC date for year, month, date at 00:00 IST (which is previous day 18:30 UTC)
  const utcMs = Date.UTC(comp.year, comp.month - 1, comp.date, 0, 0, 0, 0) - IST_OFFSET_MS;
  return new Date(utcMs);
}
