/**
 * Normalizes text for verbatim checks:
 * lowercases and collapses all whitespace sequences to a single space.
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Checks whether every non-null, non-empty string in `fields` appears
 * verbatim (case-insensitive, whitespace-normalized) in `sourceText`.
 */
export function verbatimCheck(
  fields: (string | null | undefined)[],
  sourceText: string
): boolean {
  if (!fields || fields.length === 0) return true;
  const normalizedSource = normalizeText(sourceText);

  for (const field of fields) {
    if (field === null || field === undefined) continue;
    const trimmed = field.trim();
    if (trimmed.length === 0) continue;

    const normalizedField = normalizeText(trimmed);
    if (!normalizedSource.includes(normalizedField)) {
      return false;
    }
  }

  return true;
}

/**
 * Helper to extract all numeric tokens (integers and decimals) from any input.
 */
function extractNumbers(input: unknown): Set<string> {
  const result = new Set<string>();
  const numRegex = /\b\d+(?:\.\d+)?\b/g;

  function traverse(item: unknown) {
    if (item === null || item === undefined) return;
    if (typeof item === "number") {
      result.add(String(item));
      return;
    }
    if (typeof item === "string") {
      const matches = item.match(numRegex);
      if (matches) {
        for (const m of matches) {
          result.add(m);
          // Also add without trailing decimal zeroes if any (e.g. "12.0" -> "12")
          if (m.includes(".")) {
            const num = parseFloat(m);
            if (!isNaN(num)) result.add(String(num));
          }
        }
      }
      return;
    }
    if (Array.isArray(item)) {
      for (const el of item) traverse(el);
      return;
    }
    if (typeof item === "object") {
      for (const val of Object.values(item as Record<string, unknown>)) {
        traverse(val);
      }
    }
  }

  traverse(input);
  return result;
}

/**
 * Checks whether every number appearing in `text` is grounded
 * in the provided `facts`. If the LLM generates a number not
 * present in the facts, this returns false.
 */
export function numbersGrounded(
  text: string,
  facts: (string | number | { text?: string; [k: string]: unknown })[] | string
): boolean {
  const textNumbers = extractNumbers(text);
  if (textNumbers.size === 0) {
    return true; // No numbers to ground
  }

  const factNumbers = extractNumbers(facts);

  for (const num of textNumbers) {
    if (!factNumbers.has(num)) {
      // Also check if numeric value matches any fact number
      const parsed = parseFloat(num);
      let foundNumeric = false;
      for (const factNum of factNumbers) {
        if (parseFloat(factNum) === parsed) {
          foundNumeric = true;
          break;
        }
      }
      if (!foundNumeric) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Creates a validator that checks whether confidence is at least `minConfidence`.
 */
export function confidenceAtLeast(minConfidence: number): (confidence: unknown) => boolean {
  return (confidence: unknown): boolean => {
    if (typeof confidence !== "number" || Number.isNaN(confidence)) {
      return false;
    }
    return confidence >= minConfidence && confidence <= 1;
  };
}
