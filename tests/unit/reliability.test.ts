import { afterEach, describe, expect, it, vi } from "vitest";
import { getRulesFallback } from "@/lib/ai/providers/rules";
import { subscribeIssueUpdates } from "@/lib/map/statusPresentation";
import { reserveLoginAttempt, clearLoginAttempts } from "@/lib/auth/sharedRateLimit";
import { prisma } from "@/lib/db/prisma";
import { buildPlaceProfile } from "@/lib/traffic/profile";
import { authOptions } from "@/lib/auth";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Reliability and truthful fallbacks", () => {
  it("does not turn missing telemetry into numbers, a safe risk or invented rain", () => {
    const output = getRulesFallback("G-ASSESS", { category: "POTHOLES" });
    expect(output.summary).toContain("Current traffic unavailable");
    expect(output.summary).toContain("Deterioration estimate unavailable");
    expect(output.summary).not.toMatch(/35|50|15%|rain/);
    expect(output.priorityAdjustmentRecommended).toBe(0);
    expect(output.reasoning).toContain("pending staff review");
  });
  it("does not invent a ward, rainfall or empty issue count in a missing briefing", () => {
    const output = getRulesFallback("G-BRIEF", {});
    expect(output.brief).toContain("Active issue count unavailable");
    expect(output.brief).not.toMatch(/150|0 open|mm|night window/);
  });
  it("preserves a genuinely measured zero traffic delay", () => {
    const output = getRulesFallback("G-ASSESS", { liveCongestionPct: 0 });
    expect(output.summary).toContain("Provider traffic delay 0%");
  });
  it("refreshes independently of another browser's local storage, pauses when hidden and cleans up", () => {
    vi.useFakeTimers();
    const windowTarget = Object.assign(new EventTarget(), { setInterval, clearInterval });
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("navigator", { onLine: true });
    const refresh = vi.fn();
    const stop = subscribeIssueUpdates(refresh);
    vi.advanceTimersByTime(30000);
    expect(refresh).toHaveBeenCalledTimes(1);
    documentTarget.visibilityState = "hidden";
    vi.advanceTimersByTime(30000);
    expect(refresh).toHaveBeenCalledTimes(1);
    documentTarget.visibilityState = "visible";
    windowTarget.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(2);
    stop(); vi.advanceTimersByTime(60000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("retains complete provider profiles showing genuine zero delay", async () => {
    const rows = ["WEEKDAY", "WEEKEND"].flatMap((dayType) => Array.from({ length: 24 }, (_, hour) => ({ hour, dayType, delayRatio: 0, source: "TOMTOM_HISTORIC", fetchedAt: new Date(), direction: "BOTH" })));
    vi.spyOn(prisma.placeTrafficProfile, "findMany").mockResolvedValue(rows as never);
    const result = await buildPlaceProfile({ id: "zero-delay-fixture", lat: 12.94, lng: 77.68, roadClass: "primary" });
    expect(result.fromCache).toBe(true);
    expect(result.points.every((point) => point.delayRatio === 0 && point.source === "TOMTOM_HISTORIC")).toBe(true);
  });
  it("reserves concurrent login attempts atomically in shared storage", async () => {
    const target = `shared-rate-${Date.now()}@test.invalid`;
    await clearLoginAttempts(target);
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => reserveLoginAttempt(target)));
      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      expect(results.filter((result) => !result.allowed)).toHaveLength(3);
      expect(results.every((result) => result.retryAfterSeconds > 800)).toBe(true);
    } finally { await clearLoginAttempts(target); }
  });
  it("revokes an existing JWT when its account becomes inactive", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ isActive: false, role: "AUTHORITY", passwordHash: "hash" } as never);
    const jwt = authOptions.callbacks!.jwt!;
    await expect(jwt({ token: { id: "revoked", role: "AUTHORITY" } } as never)).rejects.toThrow("SESSION_REVOKED");
  });
});
