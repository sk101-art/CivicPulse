import "server-only";
import crypto from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isAiFeatureEnabled } from "@/lib/env";
import { LlmAdapter, LlmImageInput, LlmProviderName } from "@/lib/external/llm/types";
import { geminiAdapter } from "@/lib/external/llm/gemini";
import { groqAdapter } from "@/lib/external/llm/groq";
import { ollamaAdapter } from "@/lib/external/llm/ollama";
import { getRulesFallback } from "./providers/rules";
import { checkQuota } from "./quota";
import { verbatimCheck, numbersGrounded, confidenceAtLeast } from "./validators";

export interface RunAiOptions<T> {
  feature: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | string;
  promptVer: string;
  systemPrompt?: string;
  userPrompt: string;
  images?: LlmImageInput[];
  schema: z.ZodType<T>;
  jsonSchema?: Record<string, unknown>;
  inputPayload: unknown;
  sourceTextForVerbatim?: (string | null | undefined)[];
  factsForGrounding?: (string | number | { text?: string; [k: string]: unknown })[] | string;
  minConfidence?: number;
  isNightlyBatch?: boolean;
  timeoutMs?: number;
  model?: string;
  adapters?: LlmAdapter[];
  skipCache?: boolean;
}

export interface RunAiResult<T> {
  data: T;
  provider: LlmProviderName;
  model: string;
  valid: boolean;
  cached: boolean;
  failReason?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a careful assistant inside a civic-infrastructure app. Only use information present in the " +
  'input. If you cannot tell, answer "unknown" (or "unclear"). Never guess names, numbers, dates or ' +
  "places. Output must match the JSON schema exactly. Do not add fields.";

/**
 * Computes deterministic SHA-256 hash of feature, prompt version, and input payload.
 */
export function computeInputHash(feature: string, promptVer: string, inputPayload: unknown): string {
  const serialized = JSON.stringify(inputPayload ?? {});
  return crypto
    .createHash("sha256")
    .update(`${feature}:${promptVer}:${serialized}`)
    .digest("hex");
}

/**
 * Executes an AI feature call via the free provider chain:
 * Gemini -> Groq -> (Ollama, nightly batch only) -> Rules fallback.
 */
export async function runAi<T>(options: RunAiOptions<T>): Promise<RunAiResult<T>> {
  const {
    feature,
    promptVer,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    userPrompt,
    images,
    schema,
    jsonSchema,
    inputPayload,
    sourceTextForVerbatim,
    factsForGrounding,
    minConfidence,
    isNightlyBatch = false,
    timeoutMs = 15000,
    model,
    adapters,
  } = options;

  // 1. Feature Flag Check
  if (!isAiFeatureEnabled(feature)) {
    const fallbackRaw = getRulesFallback(feature, inputPayload);
    const parsed = schema.safeParse(fallbackRaw);
    return {
      data: (parsed.success ? parsed.data : fallbackRaw) as T,
      provider: "rules",
      model: "rules-fallback",
      valid: parsed.success,
      cached: false,
      failReason: "FEATURE_DISABLED_IN_AI_FEATURES",
    };
  }

  // 2. Hash Input & Cache Lookup
  const inputHash = computeInputHash(feature, promptVer, inputPayload);
  if (!options.skipCache) {
    try {
      const cachedRun = await prisma.aiRun.findFirst({
        where: {
          feature,
          inputHash,
          valid: true,
          // Never reuse rules-fallback answers: once an LLM key is added, inputs must be re-evaluated.
          NOT: { model: { startsWith: "rules" } },
        },
        orderBy: { createdAt: "desc" },
      });

      if (cachedRun && cachedRun.output) {
        const parsed = schema.safeParse(cachedRun.output);
        if (parsed.success) {
          return {
            data: parsed.data,
            provider: (cachedRun.model.split(":")[0] as LlmProviderName) || "gemini",
            model: cachedRun.model,
            valid: true,
            cached: true,
          };
        }
      }
    } catch {
      // If DB read fails, continue to live execution without caching
    }
  }

  // 3. Prepare Provider Chain
  let chain: LlmAdapter[];
  if (adapters && adapters.length > 0) {
    chain = adapters;
  } else {
    chain = [geminiAdapter, groqAdapter];
    if (isNightlyBatch && ollamaAdapter.isConfigured()) {
      chain.push(ollamaAdapter);
    }
  }

  let lastFailReason: string | undefined;

  // Every provider gets the exact JSON shape in the prompt. Gemini also receives it as a
  // structured-output schema; Groq's JSON mode has no schema parameter, so the prompt carries it.
  const promptWithSchema = jsonSchema
    ? `${userPrompt}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`
    : `${userPrompt}\n\nRespond with a single JSON object.`;

  // 4. Try Providers in Order
  for (const adapter of chain) {
    if (!adapter.isConfigured()) {
      continue;
    }

    // Check daily quota
    const quota = await checkQuota(adapter.name, feature);
    if (!quota.allowed) {
      lastFailReason = quota.reason || "QUOTA_EXHAUSTED";
      continue;
    }

    try {
      const result = await adapter.generate({
        system: systemPrompt,
        text: promptWithSchema,
        images,
        jsonSchema,
        timeoutMs,
        model,
      });

      // Zod schema validation
      const parseResult = schema.safeParse(result.json);
      if (!parseResult.success) {
        lastFailReason = `SCHEMA_VALIDATION_FAILED: ${parseResult.error.message}`;
        // Store invalid run for auditing
        await prisma.aiRun.create({
          data: {
            feature,
            model: `${adapter.name}:${result.model}`,
            promptVer,
            inputHash,
            output: (result.json ?? {}) as Prisma.InputJsonValue,
            valid: false,
            failReason: lastFailReason,
            costUsd: 0,
          },
        }).catch(() => {});
        continue; // Fall through to next provider
      }

      // Grounding checks
      if (sourceTextForVerbatim && sourceTextForVerbatim.length > 0) {
        const verbatimPass = verbatimCheck(sourceTextForVerbatim, userPrompt);
        if (!verbatimPass) {
          lastFailReason = "VERBATIM_CHECK_FAILED";
          await prisma.aiRun.create({
            data: {
              feature,
              model: `${adapter.name}:${result.model}`,
              promptVer,
              inputHash,
              output: parseResult.data as unknown as Prisma.InputJsonValue,
              valid: false,
              failReason: lastFailReason,
              costUsd: 0,
            },
          }).catch(() => {});
          continue;
        }
      }

      if (factsForGrounding) {
        const textToGround = typeof parseResult.data === "object" && parseResult.data !== null && "text" in parseResult.data
          ? String((parseResult.data as Record<string, unknown>).text)
          : JSON.stringify(parseResult.data);
        const groundedPass = numbersGrounded(textToGround, factsForGrounding);
        if (!groundedPass) {
          lastFailReason = "NUMBERS_GROUNDING_FAILED";
          await prisma.aiRun.create({
            data: {
              feature,
              model: `${adapter.name}:${result.model}`,
              promptVer,
              inputHash,
              output: parseResult.data as unknown as Prisma.InputJsonValue,
              valid: false,
              failReason: lastFailReason,
              costUsd: 0,
            },
          }).catch(() => {});
          continue;
        }
      }

      if (typeof minConfidence === "number") {
        const confidenceVal = typeof parseResult.data === "object" && parseResult.data !== null && "confidence" in parseResult.data
          ? (parseResult.data as Record<string, unknown>).confidence
          : undefined;
        const confPass = confidenceAtLeast(minConfidence)(confidenceVal);
        if (!confPass) {
          lastFailReason = "CONFIDENCE_TOO_LOW";
          await prisma.aiRun.create({
            data: {
              feature,
              model: `${adapter.name}:${result.model}`,
              promptVer,
              inputHash,
              output: parseResult.data as unknown as Prisma.InputJsonValue,
              valid: false,
              failReason: lastFailReason,
              costUsd: 0,
            },
          }).catch(() => {});
          continue;
        }
      }

      // Valid output! Store in AiRun and return
      await prisma.aiRun.create({
        data: {
          feature,
          model: `${adapter.name}:${result.model}`,
          promptVer,
          inputHash,
          output: parseResult.data as unknown as Prisma.InputJsonValue,
          valid: true,
          costUsd: 0,
        },
      }).catch(() => {});

      return {
        data: parseResult.data,
        provider: adapter.name,
        model: result.model,
        valid: true,
        cached: false,
      };
    } catch (err) {
      lastFailReason = err instanceof Error ? err.message : String(err);
      // Move to next provider on quota (429), timeout, network or JSON failure
      continue;
    }
  }

  // 5. Fallback to Rules
  const fallbackRaw = getRulesFallback(feature, inputPayload);
  const parsedFallback = schema.safeParse(fallbackRaw);
  const finalData = (parsedFallback.success ? parsedFallback.data : fallbackRaw) as T;

  await prisma.aiRun.create({
    data: {
      feature,
      model: "rules-fallback",
      promptVer,
      inputHash,
      output: finalData as unknown as Prisma.InputJsonValue,
      valid: parsedFallback.success,
      failReason: lastFailReason || "ALL_LLM_PROVIDERS_UNAVAILABLE",
      costUsd: 0,
    },
  }).catch(() => {});

  return {
    data: finalData,
    provider: "rules",
    model: "rules-fallback",
    valid: parsedFallback.success,
    cached: false,
    failReason: lastFailReason || "ALL_LLM_PROVIDERS_UNAVAILABLE",
  };
}
