import "server-only";
import { LlmAdapter, LlmGenerateOptions, LlmGenerateResult } from "./types";

export class OllamaAdapter implements LlmAdapter {
  readonly name = "ollama" as const;

  isConfigured(): boolean {
    return process.env.OLLAMA_ENABLED === "true";
  }

  async generate(options: LlmGenerateOptions): Promise<LlmGenerateResult> {
    if (!this.isConfigured()) {
      throw new Error("OLLAMA_NOT_CONFIGURED");
    }

    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    const url = `${host.replace(/\/$/, "")}/api/chat`;
    const model = options.model || process.env.OLLAMA_MODEL || "llama3.2-vision";

    const messages: Array<{ role: string; content: string; images?: string[] }> = [];

    if (options.system) {
      messages.push({
        role: "system",
        content: options.system,
      });
    }

    const images = options.images?.map((img) => img.base64);
    messages.push({
      role: "user",
      content: options.text,
      images: images && images.length > 0 ? images : undefined,
    });

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      format: "json",
      options: {
        temperature: 0,
      },
    };

    const timeout = options.timeoutMs ?? 30000;
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
      throw new Error(`Ollama API error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = data.message?.content || "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (e) {
      throw new Error(`Ollama returned invalid JSON: ${e instanceof Error ? e.message : String(e)}: ${rawText}`);
    }

    return {
      rawText,
      json: parsedJson,
      provider: "ollama",
      model,
      finishReason: data.done ? "stop" : undefined,
    };
  }
}

export const ollamaAdapter = new OllamaAdapter();
