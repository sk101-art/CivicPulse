import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

export type TomTomProduct = "routing" | "flow" | "incidents" | "reverse-geocoding";
export const TOMTOM_DAILY_APPLICATION_CAP = 1200;
export const productKey = (product: TomTomProduct) => `tomtom:${product}`;
export const baselineKey = (product: TomTomProduct) => `tomtom:baseline:${product}`;
export const dailyKey = (product: TomTomProduct) => `tomtom:daily:${product}`;
export const productCap = (product: TomTomProduct) => product === "incidents" ? 2500 : (env.TOMTOM_MONTHLY_CALL_CAP ?? 20000);

// Provider dashboard baselines and local request reservations are separate records.
// The old aggregate is retained; it is never assigned arbitrarily to one API.
export async function getTomTomProductUsage(product: TomTomProduct) {
  const month = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  const [baseline, local, daily, legacy] = await Promise.all([
    prisma.apiUsage.findUnique({ where: { provider_month: { provider: baselineKey(product), month } } }),
    prisma.apiUsage.findUnique({ where: { provider_month: { provider: productKey(product), month } } }),
    prisma.apiUsage.findUnique({ where: { provider_month: { provider: dailyKey(product), month: day } } }),
    prisma.apiUsage.findUnique({ where: { provider_month: { provider: "tomtom", month } } }),
  ]);
  return { product, month, day, cap: productCap(product), baseline: baseline?.count ?? 0,
    localReservations: local?.count ?? 0, monthlyUsed: (baseline?.count ?? 0) + (local?.count ?? 0),
    dailyUsed: daily?.count ?? 0, reconciliationRequired: !baseline && Boolean(legacy && legacy.count > 0) };
}

class BudgetDenied extends Error {}
export async function reserveTomTomRequest(product: TomTomProduct): Promise<boolean> {
  try {
    const usage = await getTomTomProductUsage(product);
    if (usage.reconciliationRequired || usage.monthlyUsed >= usage.cap || usage.dailyUsed >= TOMTOM_DAILY_APPLICATION_CAP) return false;
    // Each actual outbound request reserves exactly once in its product/day/month.
    // Atomic conditional upserts prevent concurrent server instances overspending.
    await prisma.$transaction(async (tx) => {
      for (const bucket of [
        { provider: productKey(product), period: usage.month, cap: usage.cap - usage.baseline },
        { provider: dailyKey(product), period: usage.day, cap: TOMTOM_DAILY_APPLICATION_CAP },
      ]) {
        if (bucket.cap <= 0) throw new BudgetDenied();
        const rows = await tx.$queryRaw<Array<{ count: number }>>`
          INSERT INTO "ApiUsage" ("id", "provider", "month", "count", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${bucket.provider}, ${bucket.period}, 1, NOW(), NOW())
          ON CONFLICT ("provider", "month") DO UPDATE
          SET "count" = "ApiUsage"."count" + 1, "updatedAt" = NOW()
          WHERE "ApiUsage"."count" < ${bucket.cap}
          RETURNING "count"
        `;
        if (rows.length === 0) throw new BudgetDenied();
      }
    });
    return true;
  } catch {
    // Database failures fail closed; no request is sent with unknown allowance.
    return false;
  }
}
