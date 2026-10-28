import "server-only";
import { LlmAdapter, LlmGenerateOptions, LlmGenerateResult } from "./types";
import { env } from "@/lib/env";

export class GroqAdapter implements LlmAdapter {
  readonly name = "groq" as const;

  isConfigured(): boolean {
    const key = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
    return typeof key === "string" && key.trim().length > 0;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_KEY_NOT_CONFIGURED");
    }

    const hasImages = options.images && options.images.length > 0;
    const model = options.model ||
      (hasImages
        ? (env.GROQ_MODEL_VISION || process.env.GROQ_MODEL_VISION || "qwen/qwen3.8-27b")
        : (env.GROQ_MODEL_TEXT || process.env.GROQ_MODEL_TEXT || "openai/gpt-oss-120b"));

    const url = "https://api.groq.com/openai/v1/chat/completions";

    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [];

    if (options.system) {
      messages.push({
        role: "system",
        content: options.system,
      });
    }

    if (hasImages) {
      const userContent: Array<Record<string, unknown>> = [
        { type: "text", text: options.text },
      ];
      for (const img of options.images!) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`,
          },
        });
      }
      messages.push({
        role: "user",
        content: userContent,
      });
    } else {
      messages.push({
        role: "user",
        content: options.text,
      });
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    };

    const timeout = options.timeoutMs ?? 15000;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      if (response.status === 429) {
        throw new Error(`Groq rate limit / quota exceeded (429): ${errText}`);
      }
      throw new Error(`Groq API error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const rawText = choice?.message?.content || "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (e) {
      throw new Error(`Groq returned invalid JSON: ${e instanceof Error ? e.message : String(e)}: ${rawText}`);
    }

    return {
      rawText,
      json: parsedJson,
      provider: "groq",
      model,
      finishReason: choice?.finish_reason,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}

export const groqAdapter = new GroqAdapter();
