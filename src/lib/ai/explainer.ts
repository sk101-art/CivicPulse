import "server-only";
import { z } from "zod";
import { runAi } from "./run";
import { numbersGrounded } from "./validators";
import { LlmAdapter } from "@/lib/external/llm/types";

export const g7ExplainerSchema = z.object({
  text: z.string(),
  fact_ids: z.array(z.string()),
});

export type G7ExplainerResult = z.infer<typeof g7ExplainerSchema>;

export const g7JsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["text", "fact_ids"],
  properties: {
    text: { type: "string" },
    fact_ids: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export interface SentenceFact {
  id: string;
  text: string;
  [key: string]: unknown;
}

export interface ExplainPriorityOptions {
  adapters?: LlmAdapter[];
  skipCache?: boolean;
}

export interface ExplainPriorityResult {
  text: string;
  fact_ids: string[];
  isFallback: boolean;
  provider: string;
  failReason?: string;
}

/**
 * Rephrases Priority Index sentence facts into a concise public explainer:
 * 1. Takes fact list with IDs.
 * 2. Prompts LLM to synthesize facts citing used fact_ids.
 * 3. Enforces guardrails:
 *    - Rejects any unknown fact ID.
 *    - Rejects any invented, altered, or hallucinated numbers via numbersGrounded.
 *    - On rejection or error, immediately falls back to deterministic template string.
 */
export async function explainPrioritySentence(
  facts: SentenceFact[],
  options?: ExplainPriorityOptions
): Promise<ExplainPriorityResult> {
  const template = facts.map((f) => f.text).join(". ");

  if (!facts || facts.length === 0) {
    return {
      text: "",
      fact_ids: [],
      isFallback: true,
      provider: "rules",
    };
  }

  const promptText =
    `Synthesize these Priority Index facts into a natural, concise, factual 1-2 sentence explainer for citizens.\n` +
    `Only use the facts provided. Never invent numbers, agencies, or dates.\n` +
    `Facts:\n${JSON.stringify(facts, null, 2)}`;

  try {
    const runResult = await runAi<G7ExplainerResult>({
      feature: "G7",
      promptVer: "g7-v1",
      userPrompt: promptText,
      schema: g7ExplainerSchema,
      jsonSchema: g7JsonSchema,
      inputPayload: { facts },
      factsForGrounding: facts,
      adapters: options?.adapters,
      skipCache: options?.skipCache,
    });

    const { text, fact_ids } = runResult.data;

    // 1. Guardrail: Check for unknown fact IDs
    const knownIds = new Set(facts.map((f) => f.id));
    const hasUnknownId = fact_ids.some((id) => !knownIds.has(id));
    if (hasUnknownId) {
      return {
        text: template,
        fact_ids: facts.map((f) => f.id),
        isFallback: true,
        provider: "rules",
        failReason: "UNKNOWN_FACT_ID_REJECTED",
      };
    }

    // 2. Guardrail: Numbers grounding check against cited facts
    const citedFacts = facts.filter((f) => fact_ids.includes(f.id));
    const isGrounded = numbersGrounded(text, citedFacts);
    if (!isGrounded) {
      return {
        text: template,
        fact_ids: facts.map((f) => f.id),
        isFallback: true,
        provider: "rules",
        failReason: "INVENTED_NUMBER_REJECTED",
      };
    }

    return {
      text,
      fact_ids,
      isFallback: runResult.provider === "rules",
      provider: runResult.provider,
      failReason: runResult.failReason,
    };
  } catch (err) {
    return {
      text: template,
      fact_ids: facts.map((f) => f.id),
      isFallback: true,
      provider: "rules",
      failReason: err instanceof Error ? err.message : String(err),
    };
  }
}
