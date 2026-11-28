import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { reserveTomTomRequest, getTomTomProductUsage, productKey, baselineKey, dailyKey, productCap, type TomTomProduct } from "@/lib/external/tomtomQuota";
const month = "2099-01", day = "2099-01-02";
async function put(provider: string, period: string, count: number) {
  await prisma.apiUsage.upsert({ where: { provider_month: { provider, month: period } }, create: { provider, month: period, count }, update: { count } });
}
async function clear() { await prisma.apiUsage.deleteMany({ where: { month: { in: [month, day] }, provider: { startsWith: "tomtom" } } }); }
beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2099-01-02T12:00:00Z")); await clear(); });
afterEach(async () => { await clear(); vi.useRealTimers(); });
it("routing exhaustion does not consume or block Traffic Flow allowance", async () => {
  await put(baselineKey("routing"), month, 19999);
  await put(baselineKey("flow"), month, 1652);
  expect(await reserveTomTomRequest("routing")).toBe(true);
  expect(await reserveTomTomRequest("routing")).toBe(false);
  expect(await reserveTomTomRequest("flow")).toBe(true);
  expect((await getTomTomProductUsage("flow")).monthlyUsed).toBe(1653);
});
it("concurrent reservations cannot exceed the monthly allowance", async () => {
  await put(baselineKey("routing"), month, 19998);
  const results = await Promise.all(Array.from({ length: 5 }, () => reserveTomTomRequest("routing")));
  expect(results.filter(Boolean)).toHaveLength(2);
  expect((await getTomTomProductUsage("routing")).monthlyUsed).toBe(20000);
});
it("daily contention rolls back the unused monthly reservation and counts each request once", async () => {
  await put(dailyKey("flow"), day, 1199);
  const results = await Promise.all(Array.from({ length: 4 }, () => reserveTomTomRequest("flow")));
  expect(results.filter(Boolean)).toHaveLength(1);
  const usage = await getTomTomProductUsage("flow");
  expect(usage.dailyUsed).toBe(1200);
  expect(usage.localReservations).toBe(1);
});
it("preserves the legacy aggregate and requires a product baseline before cutover", async () => {
  await put("tomtom", month, 20001);
  expect(await reserveTomTomRequest("flow")).toBe(false);
  await put(baselineKey("flow"), month, 1652);
  expect(await reserveTomTomRequest("flow")).toBe(true);
  expect((await prisma.apiUsage.findUniqueOrThrow({ where: { provider_month: { provider: "tomtom", month } } })).count).toBe(20001);
  expect(await reserveTomTomRequest("routing")).toBe(false);
});
it("uses the dashboard's smaller incident allowance", () => {
  expect(productCap("incidents")).toBe(2500);
  for (const product of ["routing", "flow", "reverse-geocoding"] as TomTomProduct[]) expect(productCap(product)).toBe(20000);
  expect(productKey("flow")).not.toBe(productKey("routing"));
});
