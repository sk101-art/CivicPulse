import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

const HIGH_PRIORITY_FEATURES = new Set(["G1", "G2"]);
const HIGH_PRIORITY_BUFFER = 20; // Reserve last 20 calls strictly for G1/G2

let testCallCountOverride: number | null = null;

export function resetDailyQuotaForTesting(): void {
  testCallCountOverride = null;
}

export function setMockCallCountForTesting(count: number): void {
  testCallCountOverride = count;
}

/**
 * Returns the start of the current day in Asia/Kolkata timezone (or UTC).
 */
export function getStartOfToday(): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start;
}

/**
 * Checks whether the requested AI feature is allowed under the daily cap.
 */
export async function checkQuota(
  provider: string,
  feature: string
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const cap = env.AI_DAILY_CALL_CAP ?? 400;

  let currentCount: number;
  if (testCallCountOverride !== null) {
    currentCount = testCallCountOverride;
  } else {
    try {
      const startOfDay = getStartOfToday();
      currentCount = await prisma.aiRun.count({
        where: {
          model: { not: "rules-fallback" },
          createdAt: { gte: startOfDay },
        },
      });
    } catch {
      // In case DB is temporarily unreachable or in mock mode, fall back to 0
      currentCount = 0;
    }
  }

  const remaining = Math.max(0, cap - currentCount);

  // If daily cap is reached, no calls are allowed
  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: "DAILY_CAP_EXHAUSTED",
    };
  }

  // If remaining calls are within the buffer, reserve them strictly for G1 and G2
  const isHighPriority = HIGH_PRIORITY_FEATURES.has(feature.toUpperCase());
  if (!isHighPriority && remaining <= HIGH_PRIORITY_BUFFER) {
    return {
      allowed: false,
      remaining,
      reason: "RESERVED_FOR_HIGH_PRIORITY",
    };
  }

  return {
    allowed: true,
    remaining,
  };
}
