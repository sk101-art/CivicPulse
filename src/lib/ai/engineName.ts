export const UNKNOWN_ENGINE = "Unknown engine";
export const RULES_ENGINE = "Rules estimate";

const KNOWN_GEMINI_MODELS: Record<string, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "gemini-3-flash-preview": "Gemini 3 Flash Preview",
};

/**
 * Human-readable label for the engine that actually produced an AI result.
 * `model` may be the bare id ("gemini-2.5-flash") or the AiRun form ("gemini:gemini-2.5-flash").
 * Never guesses: an unrecognised Gemini id is shown verbatim, anything else unidentifiable is "Unknown engine".
 */
export function formatAiEngineName(provider: string | null | undefined, model: string | null | undefined): string {
  const p = (provider || "").toLowerCase();
  const m = (model || "").trim();
  const lower = m.toLowerCase();

  if (p === "rules" || lower.startsWith("rules")) return RULES_ENGINE;

  if (p === "gemini" || lower.includes("gemini")) {
    const raw = m.replace(/^gemini:/i, "");
    if (!raw) return UNKNOWN_ENGINE;
    return KNOWN_GEMINI_MODELS[raw] ?? `Gemini (${raw})`;
  }

  if (p === "groq" || lower.startsWith("groq:") || lower.includes("qwen") || lower.includes("gpt-oss")) {
    const raw = m.replace(/^groq:/i, "");
    return raw ? `Groq ${raw}` : UNKNOWN_ENGINE;
  }

  if (p === "ollama" || lower.startsWith("ollama:")) {
    const raw = m.replace(/^ollama:/i, "");
    return raw ? `Ollama ${raw}` : UNKNOWN_ENGINE;
  }

  return UNKNOWN_ENGINE;
}

/** Engine label from an AiRun row's `model` column ("<provider>:<model>" or "rules-fallback"). */
export function engineFromAiRunModel(model: string | null | undefined): string {
  if (!model) return UNKNOWN_ENGINE;
  const provider = model.includes(":") ? model.split(":")[0] : "";
  return formatAiEngineName(provider, model);
}
