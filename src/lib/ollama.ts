/**
 * Ollama AI Wrapper for CivicPulse
 * Configured for RTX 3050 local inference using qwen2.5-coder:7b
 */

export const OLLAMA_BASE_URL = "http://localhost:11434";
export const MODEL_NAME = "qwen2.5-coder:7b";

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

/**
 * Basic wrapper to generate a response from local Ollama instance
 */
export async function generateResponse(prompt: string, options = {}) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: prompt,
        stream: false,
        ...options,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data: OllamaResponse = await response.json();
    return data.response;
  } catch (error) {
    console.error("Error connecting to Ollama:", error);
    throw error;
  }
}

/**
 * Basic wrapper for chat completion
 */
export async function generateChat(messages: { role: string, content: string }[], options = {}) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: messages,
        stream: false,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
    } catch (error) {
      console.error('Ollama API error:', error);
      throw error;
    }
}

/**
 * Civic Health Scoring based on ward data
 * As per Phase 6.2 of the MVP Plan
 */
export interface WardData {
  wardId: string;
  totalReports: number;
  resolvedReports: number;
  avgResolutionDays: number;
  categoryBreakdown: Record<string, number>;
}

export async function generateHealthGrade(wardData: WardData): Promise<string> {
  const prompt = `
    Analyze this ward's civic infrastructure data:
    - Total Reports: ${wardData.totalReports}
    - Resolved: ${wardData.resolvedReports}
    - Avg Resolution Days: ${wardData.avgResolutionDays}

    Based on resolution trends, assign a letter grade (A-F).
    Provide a brief explanation.
  `;

  return await generateChat([{ role: 'user', content: prompt }]);
}

/**
 * Check if Ollama service is reachable
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generic chat wrapper as per plan
 */
export async function chatWithModel(prompt: string, model = MODEL_NAME) {
  try {
    return await generateChat([{ role: 'user', content: prompt }], { model });
  } catch (error) {
    console.error('Ollama connection failed:', error);
    return null;
  }
}


