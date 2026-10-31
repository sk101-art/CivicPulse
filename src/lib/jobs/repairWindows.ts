import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { Status } from "@prisma/client";
import { recomputeAndSaveBestRepairWindow } from "@/lib/traffic/repairWindow";

const MAX_PER_RUN = 10;

export interface RepairWindowsJobResult {
  processed: number;
  remaining?: number;
  failed?: number;
  partial?: boolean;
  firstError?: string;
  skipped?: string;
}

export function computeRepairWindowInputHash(inputs: {
  category: string;
  lanePosition?: string | null;
  deteriorationRisk?: string | null;
  deteriorationScore?: number | null;
  priority?: number | null;
  profileFetchedAt?: Date | string | null;
  weatherDate?: Date | string | null;
}): string {
  const payload = [
    inputs.category,
    inputs.lanePosition || "default",
    inputs.deteriorationRisk || "LOW",
    inputs.deteriorationScore ?? 0,
    inputs.priority ? Math.round(inputs.priority * 10) / 10 : 0,
    inputs.profileFetchedAt instanceof Date ? inputs.profileFetchedAt.toISOString() : (inputs.profileFetchedAt || "none"),
    inputs.weatherDate instanceof Date ? inputs.weatherDate.toISOString().slice(0, 10) : (inputs.weatherDate || "none"),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * Scheduled job: "repair-windows" (every 2h at :40).
 * Recomputes and persists bestRepairWindow for active open issues whose inputs have changed
 * (traffic profile fetchedAt, weather forecast date, lanePosition, category, deterioration risk/score).
 * Max 10 issues per run, stopping when < 15s of the 40s budget remains.
 */
export async function runRepairWindowsJob(
  startedAt: number = Date.now(),
  timeBudgetMs: number = 40_000,
  tracker?: { processed: number; remaining: number }
): Promise<RepairWindowsJobResult> {
  const openIssues = await prisma.issue.findMany({
    where: {
      status: {
        notIn: [Status.VERIFIED_FIXED, Status.REJECTED],
      },
    },
    select: {
      id: true,
      category: true,
      lanePosition: true,
      deteriorationRisk: true,
      deteriorationScore: true,
      priority: true,
      wardId: true,
      bestRepairWindow: true,
      repairWindowInputHash: true,
    },
    orderBy: [
      { priority: "desc" },
    ],
    take: 100,
  });

  if (openIssues.length === 0) {
    return { processed: 0, remaining: 0, skipped: "No open issues found" };
  }

  const issueIds = openIssues.map((i) => i.id);
  const wardIds = [...new Set(openIssues.map((i) => i.wardId || "pilot"))];

  // Batch query latest place profile fetchedAt per issue
  const profiles = await prisma.placeTrafficProfile.groupBy({
    by: ["issueId"],
    where: { issueId: { in: issueIds } },
    _max: { fetchedAt: true },
  });
  const profileFetchedMap = new Map<string, Date | null>();
  for (const p of profiles) {
    if (p.issueId) profileFetchedMap.set(p.issueId, p._max.fetchedAt);
  }

  // Batch query latest weather hour per ward / pilot
  const weatherRows = await prisma.weatherForecast.groupBy({
    by: ["pointKey"],
    where: { pointKey: { in: wardIds } },
    _max: { hour: true },
  });
  const weatherDateMap = new Map<string, Date | null>();
  for (const w of weatherRows) {
    weatherDateMap.set(w.pointKey, w._max.hour);
  }

  const needsRecompute: Array<{ id: string; inputHash: string }> = [];

  for (const issue of openIssues) {
    const profileFetchedAt = profileFetchedMap.get(issue.id) || null;
    const weatherDate = weatherDateMap.get(issue.wardId || "pilot") || null;

    const currentHash = computeRepairWindowInputHash({
      category: issue.category,
      lanePosition: issue.lanePosition,
      deteriorationRisk: issue.deteriorationRisk,
      deteriorationScore: issue.deteriorationScore,
      priority: issue.priority,
      profileFetchedAt,
      weatherDate,
    });

    if (
      !issue.bestRepairWindow ||
      issue.repairWindowInputHash !== currentHash
    ) {
      needsRecompute.push({ id: issue.id, inputHash: currentHash });
    }
  }

  if (tracker) {
    tracker.remaining = needsRecompute.length;
  }

  let processed = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const item of needsRecompute.slice(0, MAX_PER_RUN)) {
    // Stop starting new issues when < 15s of 40s budget remains
    if (Date.now() - startedAt > timeBudgetMs - 15_000) {
      break;
    }

    try {
      await recomputeAndSaveBestRepairWindow(item.id, new Date(), {
        allowLiveOverpass: false,
        inputHash: item.inputHash,
      });
      processed++;
    } catch (err) {
      failed++;
      if (!firstError) {
        firstError = err instanceof Error ? err.message : String(err);
      }
    }

    if (tracker) {
      tracker.processed = processed;
      tracker.remaining = Math.max(0, needsRecompute.length - processed);
    }
  }

  const remaining = Math.max(0, needsRecompute.length - processed);

  return {
    processed,
    remaining,
    failed,
    partial: remaining > 0,
    firstError,
  };
}
