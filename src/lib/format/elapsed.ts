/**
 * Elapsed time between two ISO timestamps (end defaults to now).
 * Returns "—" when there is no start time: an unknown duration is not "0h".
 */
export function getElapsedTime(start: string | null, end: string | null, now: number = Date.now()): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  if (Number.isNaN(s)) return "—";
  const e = end ? new Date(end).getTime() : now;
  const diff = e - s;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remMins}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}
