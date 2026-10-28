import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { explainPrioritySentence, SentenceFact } from "@/lib/ai/explainer";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";

describe("T57 Acceptance Test: G7 Explainers (PI Sentence Rephrasing)", () => {
  const normalFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-gemini-g7.json"),
      "utf-8"
    )
  );

  const hallucinatedFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-gemini-g7-hallucinated.json"),
      "utf-8"
    )
  );

  const sampleFacts: SentenceFact[] = [
    { id: "f_summary", text: "HIGH priority (72.4) — POTHOLES on primary road" },
    { id: "f_sev", text: "Severity: 75% in wheel_path" },
    { id: "f_conf", text: "2 distinct user reports" },
    { id: "f_sla", text: "Target resolution within 24 hours" },
  ];

  const expectedTemplate = sampleFacts.map((f) => f.text).join(". ");

  it("successfully synthesizes factual sentences with verified cited fact IDs and grounded numbers", async () => {
    const mockGemini: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = normalFixture.candidates[0].content.parts[0].text;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const result = await explainPrioritySentence(sampleFacts, {
      adapters: [mockGemini],
      skipCache: true,
    });

    expect(result.isFallback).toBe(false);
    expect(result.text).toContain("72.4");
    expect(result.text).toContain("2 distinct user reports");
    expect(result.fact_ids).toEqual(["f_summary", "f_sev", "f_conf"]);
  });

  it("ACCEPTANCE CHECK: Invented or hallucinated number causes immediate fallback to template", async () => {
    // Hallucinated fixture states "4 distinct user reports", but input fact only had "2 distinct user reports"
    const mockGeminiHallucinated: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = hallucinatedFixture.candidates[0].content.parts[0].text;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const result = await explainPrioritySentence(sampleFacts, {
      adapters: [mockGeminiHallucinated],
      skipCache: true,
    });

    // Guardrail triggered!
    expect(result.isFallback).toBe(true);
    expect(result.failReason).toMatch(/NUMBERS_GROUNDING_FAILED|INVENTED_NUMBER_REJECTED/);
    // Fallback text matches exact deterministic template string
    expect(result.text).toBe(expectedTemplate);
    expect(result.fact_ids).toEqual(sampleFacts.map((f) => f.id));
  });

  it("rejects output with unknown fact IDs and falls back to template", async () => {
    const mockUnknownId: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        return {
          rawText: '{"text":"HIGH priority on road","fact_ids":["f_summary","f_hallucinated_id_999"]}',
          json: {
            text: "HIGH priority on road",
            fact_ids: ["f_summary", "f_hallucinated_id_999"],
          },
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const result = await explainPrioritySentence(sampleFacts, {
      adapters: [mockUnknownId],
      skipCache: true,
    });

    expect(result.isFallback).toBe(true);
    expect(result.failReason).toBe("UNKNOWN_FACT_ID_REJECTED");
    expect(result.text).toBe(expectedTemplate);
  });

  it("falls back to template cleanly when LLM providers fail or are unconfigured", async () => {
    const mockFailing: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        throw new Error("Gemini quota 429 ResourceExhausted");
      },
    };

    const result = await explainPrioritySentence(sampleFacts, {
      adapters: [mockFailing],
      skipCache: true,
    });

    expect(result.isFallback).toBe(true);
    expect(result.text).toBe(expectedTemplate);
    expect(result.provider).toBe("rules");
  });
});
