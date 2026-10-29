import "server-only";
import { LlmAdapter, LlmGenerateOptions, LlmGenerateResult } from "./types";
import { env } from "@/lib/env";

export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
];

// In-memory cache for the working Gemini model (valid for 1 hour)
let workingModelCache: { model: string; expiresAt: number } | null = null;

export function getCachedWorkingModel(): string | null {
  if (workingModelCache && Date.now() < workingModelCache.expiresAt) {
    return workingModelCache.model;
  }
  return null;
}

export function setWorkingModelCache(model: string, ttlMs: number = 60 * 60 * 1000): void {
  workingModelCache = {
    model,
    expiresAt: Date.now() + ttlMs,
  };
}

export function resetGeminiModelCacheForTesting(): void {
  workingModelCache = null;
}

export function resolveGeminiModelCandidates(requestedModel?: string): string[] {
  const envModelsStr = process.env.GEMINI_MODELS || env.GEMINI_MODELS;
  const envList = envModelsStr
    ? envModelsStr.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_GEMINI_FALLBACK_MODELS;

  const primaryModel = requestedModel || env.GEMINI_MODEL || process.env.GEMINI_MODEL;
  const candidateList = primaryModel
    ? [primaryModel, ...envList.filter((m) => m !== primaryModel)]
    : envList;

  // If a working model is currently cached, prioritize it first
  const cached = getCachedWorkingModel();
  if (cached && candidateList.includes(cached)) {
    return [cached, ...candidateList.filter((m) => m !== cached)];
  }

  return candidateList;
}

export class GeminiAdapter implements LlmAdapter {
  readonly name = "gemini" as const;

  isConfigured(): boolean {
    const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    return typeof key === "string" && key.trim().length > 0;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_KEY_NOT_CONFIGURED");
    }

    const modelsToTry = resolveGeminiModelCandidates(options.model);

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    parts.push({ text: options.text });

    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      }
    }

    const timeout = options.timeoutMs ?? 15000;
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const body: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      };

      if (options.system) {
        body.systemInstruction = {
          parts: [{ text: options.system }],
        };
      }

      if (options.jsonSchema) {
        (body.generationConfig as Record<string, unknown>).responseJsonSchema = options.jsonSchema;
      }

      const send = (payload: Record<string, unknown>) =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeout),
        });

      try {
        let response = await send(body);

        if (response.status === 400 && options.jsonSchema) {
          const retryBody = {
            ...body,
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          };
          response = await send(retryBody);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          if (response.status === 429) {
            throw new Error(`Gemini rate limit / quota exceeded (429): ${errText}`);
          }
          // On 404, 503, or 400 indicating model not available / unsupported, failover to next candidate model
          const isModelUnavailable =
            response.status === 404 ||
            response.status === 503 ||
            (response.status === 400 && (errText.includes("not available") || errText.includes("not found") || errText.includes("unsupported")));

          if (isModelUnavailable) {
            lastError = new Error(`Gemini ${model} HTTP ${response.status}: ${errText}`);
            continue;
          }
          throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text || "";

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          const match = rawText.match(/\{[\s\S]*\}/);
          if (match) {
            parsedJson = JSON.parse(match[0]);
          } else {
            throw new Error(`Gemini returned invalid JSON: ${rawText}`);
          }
        }

        // Cache working model for 1 hour
        setWorkingModelCache(model, 60 * 60 * 1000);

        return {
          rawText,
          json: parsedJson,
          provider: "gemini",
          model,
          finishReason: candidate?.finishReason,
          usage: data.usageMetadata ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          } : undefined,
        };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (modelsToTry.indexOf(model) < modelsToTry.length - 1) {
          continue;
        }
      }
    }

    throw lastError || new Error("All Gemini model candidates failed");
  }
}

export const geminiAdapter = new GeminiAdapter();
