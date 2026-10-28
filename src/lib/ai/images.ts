import "server-only";
import { env } from "@/lib/env";
import type { LlmImageInput } from "@/lib/external/llm/types";

const MAX_LLM_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB, comfortably inside Gemini and Groq inline limits
const ALLOWED: ReadonlyArray<LlmImageInput["mimeType"]> = ["image/jpeg", "image/png", "image/webp"];

function normaliseMime(raw: string | null | undefined): LlmImageInput["mimeType"] | null {
  const m = (raw || "").split(";")[0].trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return (ALLOWED as readonly string[]).includes(m) ? (m as LlmImageInput["mimeType"]) : null;
}

/**
 * Returns true only for photo URLs we are willing to fetch server-side:
 * our own Supabase storage host. This prevents the AI worker from being used to
 * fetch arbitrary URLs (SSRF) and skips seed placeholders.
 */
export function isTrustedEvidenceUrl(url: string): boolean {
  if (!env.SUPABASE_URL) return false;
  try {
    const target = new URL(url);
    const storage = new URL(env.SUPABASE_URL);
    return target.protocol === "https:" && target.host === storage.host;
  } catch {
    return false;
  }
}

/**
 * Loads an evidence photo for an LLM call.
 * - data: URIs are decoded directly.
 * - https URLs are fetched only from the project's Supabase storage host.
 * Returns null when the photo can't be used (the caller then falls back to text-only or rules).
 */
export async function loadImageForLlm(url: string | null | undefined): Promise<LlmImageInput | null> {
  if (!url) return null;

  if (url.startsWith("data:image/")) {
    const match = url.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = normaliseMime(match[1]);
    if (!mimeType) return null;
    if (Math.ceil((match[2].length * 3) / 4) > MAX_LLM_IMAGE_BYTES) return null;
    return { mimeType, base64: match[2] };
  }

  if (!isTrustedEvidenceUrl(url)) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const mimeType = normaliseMime(res.headers.get("content-type")) ?? "image/jpeg";
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LLM_IMAGE_BYTES) return null;
    return { mimeType, base64: bytes.toString("base64") };
  } catch {
    return null;
  }
}
