import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkQuota,
  resetDailyQuotaForTesting,
  setMockCallCountForTesting,
} from "@/lib/ai/quota";

describe("T50 AI Quota & Priority Allocation", () => {
  beforeEach(() => {
    resetDailyQuotaForTesting();
  });

  afterEach(() => {
    resetDailyQuotaForTesting();
  });

  it("allows calls when well below the cap (e.g. 50 calls out of 400)", async () => {
    setMockCallCountForTesting(50);
    const resultG1 = await checkQuota("gemini", "G1");
    expect(resultG1.allowed).toBe(true);
    expect(resultG1.remaining).toBe(350);

    const resultG3 = await checkQuota("gemini", "G3");
    expect(resultG3.allowed).toBe(true);
    expect(resultG3.remaining).toBe(350);
  });

  it("blocks low-priority features (G3-G8) when remaining calls are within the buffer (<= 20 remaining)", async () => {
    setMockCallCountForTesting(385); // 15 remaining out of 400

    // G1 and G2 are high priority and must still be allowed
    const resultG1 = await checkQuota("gemini", "G1");
    expect(resultG1.allowed).toBe(true);
    expect(resultG1.remaining).toBe(15);

    const resultG2 = await checkQuota("groq", "G2");
    expect(resultG2.allowed).toBe(true);
    expect(resultG2.remaining).toBe(15);

    // G3, G7 etc are low priority and must be rejected to reserve quota
    const resultG3 = await checkQuota("gemini", "G3");
    expect(resultG3.allowed).toBe(false);
    expect(resultG3.reason).toBe("RESERVED_FOR_HIGH_PRIORITY");

    const resultG7 = await checkQuota("groq", "G7");
    expect(resultG7.allowed).toBe(false);
    expect(resultG7.reason).toBe("RESERVED_FOR_HIGH_PRIORITY");
  });

  it("blocks all features when daily cap is completely exhausted (400 calls)", async () => {
    setMockCallCountForTesting(400);

    const resultG1 = await checkQuota("gemini", "G1");
    expect(resultG1.allowed).toBe(false);
    expect(resultG1.remaining).toBe(0);
    expect(resultG1.reason).toBe("DAILY_CAP_EXHAUSTED");

    const resultG2 = await checkQuota("groq", "G2");
    expect(resultG2.allowed).toBe(false);
    expect(resultG2.remaining).toBe(0);
  });
});
