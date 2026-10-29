import { runDurabilityJob } from "@/lib/audit/blindAudit";

export interface DurabilityJobResult {
  processed: number;
  createdTasksCount?: number;
  skipped?: string;
  failed?: number;
}

/**
 * Scheduled job: durability (hourly)
 * For VERIFIED_FIXED issues inside warranty:
 * 1. Checks milestones: claim + 7d, + 30d, + 90d.
 * 2. Checks rain trigger: within 48h after any day with rain >= 20 mm.
 * Creates DURABILITY audit tasks assigned to eligible citizens.
 */
export async function runDurability(
  startedAt?: number,
  timeBudgetMs: number = 40_000
): Promise<DurabilityJobResult> {
  void startedAt;
  void timeBudgetMs;
  try {
    const result = await runDurabilityJob(new Date());
    return {
      processed: result.processed,
      createdTasksCount: result.createdTasksCount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[durability-job] failed:", message);
    return {
      processed: 0,
      failed: 1,
      skipped: `Durability job failed: ${message}`,
    };
  }
}
