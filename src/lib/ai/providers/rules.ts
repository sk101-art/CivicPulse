export function getRulesFallback(feature: string, input: unknown): Record<string, unknown> {
  const inp = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (feature) {
    case "G1": {
      // Photo triage
      const reportedCategory = typeof inp.category === "string" ? inp.category : "unknown";
      return {
        category: reportedCategory,
        size_class: "unknown",
        lane_position: "unknown",
        water_present: "unknown",
        recapture_suspected: "no",
        faces_or_plates: "no",
        confidence: 0.5,
      };
    }

    case "G2": {
      // Fix-check comparator
      return {
        same_location: "unclear",
        defect_still_visible: "unclear",
        confidence: 0.5,
      };
    }

    case "G3": {
      // Duplicate detection
      return {
        verdict: "unclear",
        confidence: 0.5,
      };
    }

    case "G4": {
      // Signboard OCR extraction
      return {
        agency: null,
        contractor: null,
        work_order: null,
        start_date: null,
        end_date: null,
      };
    }

    case "G5": {
      // Signal extraction from news / Reddit
      return {
        relevant: "no",
        place_text: null,
        category: "unknown",
        happened_at: null,
      };
    }

    case "G6": {
      // Language translation
      const text = typeof inp.text === "string" ? inp.text : (typeof inp.note === "string" ? inp.note : "");
      return {
        language: "English",
        english: text,
      };
    }

    case "G7": {
      // Explainer
      const facts = Array.isArray(inp.facts) ? inp.facts : [];
      const textParts = facts
        .map((f) => (typeof f === "object" && f !== null && "text" in f ? String(f.text) : String(f)))
        .filter(Boolean);
      const factIds = facts
        .map((f) => (typeof f === "object" && f !== null && "id" in f ? String(f.id) : null))
        .filter((id): id is string => Boolean(id));

      return {
        text: textParts.join(". "),
        fact_ids: factIds,
      };
    }

    case "G8": {
      // Moderation
      return {
        abuse: "no",
        personal_info: "no",
        faces_or_plates: "no",
      };
    }

    default:
      return {
        fallback: true,
        reason: "rules_fallback_default",
      };
  }
}
