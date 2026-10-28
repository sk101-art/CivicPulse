import { PriorityConfig } from "@/config/priority";

export interface EvidenceItem {
  userId: string;
  role: string; // "REPORT" | "CONFIRM"
  offline?: boolean;
  recaptureSuspected?: boolean;
}

export interface ConfidenceInputs {
  evidenceCount?: number | null; // direct numeric override if passed
  evidenceList?: EvidenceItem[];
}

export function computeConfidence(
  inputs: ConfidenceInputs,
  config: PriorityConfig
): { c: number; n: number; missing: string[] } {
  const missing: string[] = [];

  let n = 1.0;
  if (inputs.evidenceCount !== undefined && inputs.evidenceCount !== null) {
    n = inputs.evidenceCount;
  } else if (inputs.evidenceList && inputs.evidenceList.length > 0) {
    const userWeights = new Map<string, number>();

    for (const ev of inputs.evidenceList) {
      if (!["REPORT", "CONFIRM", "INITIAL_REPORT"].includes(ev.role)) {
        continue;
      }
      const weight = ev.offline || ev.recaptureSuspected
        ? config.confidence.discountedWeight
        : 1.0;

      const existing = userWeights.get(ev.userId) ?? 0;
      if (weight > existing) {
        userWeights.set(ev.userId, weight);
      }
    }

    n = Array.from(userWeights.values()).reduce((sum, w) => sum + w, 0);
  } else {
    missing.push("evidenceData");
  }

  // C = 0.5 + 0.5 × min(1, n / 3)
  const ratio = Math.min(1.0, n / config.confidence.divisor);
  const c = config.confidence.base + config.confidence.maxAdditional * ratio;

  return {
    c: Math.round(c * 1000) / 1000,
    n: Math.round(n * 100) / 100,
    missing,
  };
}
