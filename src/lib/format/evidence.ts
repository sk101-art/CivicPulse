/**
 * Evidence label for the desk drawer. Shows the true number of evidence reports;
 * never inflates zero to one.
 */
export function formatEvidenceCount(issue: {
  _count?: { reports?: number } | null;
  reports?: unknown[] | null;
}): string {
  const count = typeof issue._count?.reports === "number" ? issue._count.reports : issue.reports?.length ?? 0;
  if (count <= 0) return "No evidence yet";
  return `${count} evidence report${count === 1 ? "" : "s"}`;
}
