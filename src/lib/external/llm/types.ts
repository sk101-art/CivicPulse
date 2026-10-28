export type LlmProviderName = "gemini" | "groq" | "ollama" | "rules";

export interface LlmImageInput {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface LlmGenerateOptions {
  system?: string;
  text: string;
  images?: LlmImageInput[];
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
  model?: string;
}

export interface LlmGenerateResult {
  rawText: string;
  json?: unknown;
  provider: LlmProviderName;
  model: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LlmAdapter {
  readonly name: LlmProviderName;
  isConfigured(): boolean;
  generate(options: LlmGenerateOptions): Promise<LlmGenerateResult>;
}
