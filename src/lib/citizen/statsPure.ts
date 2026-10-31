/** Pure helpers for citizen stats (no database access, safe to unit test and import anywhere). */

export const TIER_THRESHOLDS = [
  { tier: "CITIZEN", min: 0 },
  { tier: "CONTRIBUTOR", min: 200 },
  { tier: "GUARDIAN", min: 500 },
  { tier: "AMBASSADOR", min: 1000 },
] as const;

/** Keeps the most recent report per issue (input must be newest first). */
export function latestReportPerIssue<T extends { issueId: string }>(reports: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of reports) {
    if (seen.has(r.issueId)) continue;
    seen.add(r.issueId);
    out.push(r);
  }
  return out;
}

/** Progress towards the next tier; `next` is null at the top tier. */
export function nextTierProgress(reputation: number) {
  const rep = Math.max(0, Math.floor(reputation || 0));
  let currentIdx = 0;
  TIER_THRESHOLDS.forEach((t, i) => {
    if (rep >= t.min) currentIdx = i;
  });
  const current = TIER_THRESHOLDS[currentIdx];
  const next = TIER_THRESHOLDS[currentIdx + 1] ?? null;
  const pct = next ? Math.round(((rep - current.min) / (next.min - current.min)) * 100) : 100;
  return {
    tier: current.tier,
    next: next?.tier ?? null,
    pointsToNext: next ? next.min - rep : 0,
    pct: Math.min(100, Math.max(0, pct)),
  };
}

/** "Priya S." style name for public lists; never an email address. */
export function publicDisplayName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Citizen";
  const first = parts[0].replace(/@.*/, "");
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : "";
  return `${first}${last}`.slice(0, 40);
}
