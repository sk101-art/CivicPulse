import "server-only";
import { LlmAdapter, LlmGenerateOptions, LlmGenerateResult } from "./types";
import { env } from "@/lib/env";

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

    const model = options.model || env.GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

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
      (body.generationConfig as Record<string, unknown>).responseSchema = options.jsonSchema;
    }

    const timeout = options.timeoutMs ?? 15000;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      if (response.status === 429) {
        throw new Error(`Gemini rate limit / quota exceeded (429): ${errText}`);
      }
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text || "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (e) {
      throw new Error(`Gemini returned invalid JSON: ${e instanceof Error ? e.message : String(e)}: ${rawText}`);
    }

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
  }
}

export const geminiAdapter = new GeminiAdapter();
