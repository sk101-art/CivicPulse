import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { runAi, computeInputHash } from "@/lib/ai/run";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";
import { resetDailyQuotaForTesting, setMockCallCountForTesting } from "@/lib/ai/quota";
import { prisma } from "@/lib/db/prisma";

const testSchema = z.object({
  category: z.string(),
  size_class: z.string(),
  confidence: z.number(),
});

describe("T50 Contract Test: AI Provider Chain & Guardrails", () => {
  const TEST_FEATURE = "G1";
  const TEST_PROMPT_VER = "test-v1";

  beforeAll(async () => {
    resetDailyQuotaForTesting();
  });

  afterAll(async () => {
    resetDailyQuotaForTesting();
    // Clean up test runs from AiRun
    try {
      await prisma.aiRun.deleteMany({
        where: { promptVer: TEST_PROMPT_VER },
      });
    } catch {
      // Ignore if disconnected
    }
  });

  it("falls back to secondary provider when primary returns invalid JSON", async () => {
    let primaryCalled = false;
    let secondaryCalled = false;

    const mockPrimary: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        primaryCalled = true;
        throw new Error("Gemini returned invalid JSON: unexpected token <");
      },
    };

    const mockSecondary: LlmAdapter = {
      name: "groq",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        secondaryCalled = true;
        return {
          rawText: '{"category":"POTHOLES","size_class":"large","confidence":0.95}',
          json: { category: "POTHOLES", size_class: "large", confidence: 0.95 },
          provider: "groq",
          model: "qwen/qwen3.8-27b",
        };
      },
    };

    const result = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Analyze this road damage",
      inputPayload: { id: "test-invalid-json-1", category: "POTHOLES" },
      schema: testSchema,
      adapters: [mockPrimary, mockSecondary],
    });

    expect(primaryCalled).toBe(true);
    expect(secondaryCalled).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.provider).toBe("groq");
    expect(result.data.category).toBe("POTHOLES");
    expect(result.data.confidence).toBe(0.95);
    expect(result.cached).toBe(false);
  });

  it("falls back to secondary provider on primary rate limit / quota 429", async () => {
    const mockPrimary429: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        throw new Error("Gemini rate limit / quota exceeded (429): ResourceExhausted");
      },
    };

    const mockSecondary: LlmAdapter = {
      name: "groq",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        return {
          rawText: '{"category":"DRAINAGE","size_class":"medium","confidence":0.88}',
          json: { category: "DRAINAGE", size_class: "medium", confidence: 0.88 },
          provider: "groq",
          model: "qwen/qwen3.8-27b",
        };
      },
    };

    const result = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Analyze this drainage overflow",
      inputPayload: { id: "test-429-fallback-1", category: "DRAINAGE" },
      schema: testSchema,
      adapters: [mockPrimary429, mockSecondary],
    });

    expect(result.valid).toBe(true);
    expect(result.provider).toBe("groq");
    expect(result.data.category).toBe("DRAINAGE");
  });

  it("falls back to deterministic rules when all providers fail or are unconfigured", async () => {
    const mockFailing: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        throw new Error("Network timeout after 15000ms");
      },
    };

    const result = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Analyze road damage",
      inputPayload: { id: "test-all-failing-1", category: "POTHOLES" },
      schema: testSchema,
      adapters: [mockFailing],
    });

    expect(result.provider).toBe("rules");
    expect(result.model).toBe("rules-fallback");
    expect(result.valid).toBe(true);
    expect(result.data.category).toBe("POTHOLES");
    expect(result.data.size_class).toBe("unknown");
    expect(result.data.confidence).toBe(0.5);
  });

  it("returns cached output for identical inputHash without calling adapters", async () => {
    let callCount = 0;
    const mockAdapter: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        callCount++;
        return {
          rawText: '{"category":"POTHOLES","size_class":"small","confidence":0.92}',
          json: { category: "POTHOLES", size_class: "small", confidence: 0.92 },
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const payload = { id: "unique-cache-key-999", type: "road_cut" };

    // 1st run: fresh call
    const run1 = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Test caching prompt",
      inputPayload: payload,
      schema: testSchema,
      adapters: [mockAdapter],
    });
    expect(run1.cached).toBe(false);
    expect(callCount).toBe(1);

    // 2nd run: should hit cache in AiRun table
    const run2 = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Test caching prompt",
      inputPayload: payload,
      schema: testSchema,
      adapters: [mockAdapter],
    });
    expect(run2.cached).toBe(true);
    expect(callCount).toBe(1); // Provider NOT called second time!
    expect(run2.data.category).toBe("POTHOLES");
  });

  it("falls back to rules fallback when quota is completely exhausted", async () => {
    setMockCallCountForTesting(400); // 400 out of 400 used

    let adapterCalled = false;
    const mockAdapter: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        adapterCalled = true;
        return {
          rawText: "{}",
          json: {},
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const result = await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Analyze road damage under exhausted quota",
      inputPayload: { id: "test-exhausted-1", category: "POTHOLES" },
      schema: testSchema,
      adapters: [mockAdapter],
    });

    expect(adapterCalled).toBe(false); // Provider never invoked!
    expect(result.provider).toBe("rules");
    expect(result.model).toBe("rules-fallback");
    expect(result.data.category).toBe("POTHOLES");
  });

  it("persists audit rows in the AiRun database table with inputHash and valid flag", async () => {
    const payload = { auditTest: true, stamp: Date.now() };
    const hash = computeInputHash(TEST_FEATURE, TEST_PROMPT_VER, payload);

    await runAi({
      feature: TEST_FEATURE,
      promptVer: TEST_PROMPT_VER,
      userPrompt: "Audit persistence test",
      inputPayload: payload,
      schema: testSchema,
      adapters: [], // Will use rules fallback
    });

    const aiRunRow = await prisma.aiRun.findFirst({
      where: {
        feature: TEST_FEATURE,
        inputHash: hash,
        promptVer: TEST_PROMPT_VER,
      },
    });

    expect(aiRunRow).not.toBeNull();
    expect(aiRunRow?.valid).toBe(true);
    expect(aiRunRow?.costUsd).toBe(0);
    expect(aiRunRow?.model).toBe("rules-fallback");
  });
});
