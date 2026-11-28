export interface SearchableWardItem {
  id: string;
  code?: string | null;
  wardNumber?: string | number | null;
  wardLabel?: string | null;
  name: string;
  nameKn?: string | null;
  corporationName?: string | null;
  zoneName?: string | null;
}

/**
 * Strips leading "Ward <number> [·|-]" prefixes so type-to-search matches
 * the actual ward name (e.g. "Ward 84 · Marathahalli" -> "marathahalli").
 */
export function extractWardBaseName(rawName: string): string {
  return rawName
    .replace(/^ward\s+\d+\s*[·•:\-–—]?\s*/i, '')
    .replace(/[-.·•]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeSearchTerm(input: string): string {
  return input
    .replace(/[-.·•]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function matchesWardSearch(ward: SearchableWardItem, query: string): boolean {
  const q = normalizeSearchTerm(query);
  if (!q) return true;

  const baseName = extractWardBaseName(ward.name);
  const fullNormalized = [
    baseName,
    ward.name,
    ward.wardLabel ?? '',
    ward.wardNumber != null ? String(ward.wardNumber) : '',
    ward.code ?? '',
    ward.corporationName ?? '',
    ward.zoneName ?? '',
    ward.nameKn ?? '',
  ]
    .map(normalizeSearchTerm)
    .join(' ');

  return fullNormalized.includes(q);
}

/**
 * Finds the next matching ward index for keyboard type-to-jump:
 * - Single/repeated character (e.g. 'm' pressed repeatedly): cycles through
 *   wards whose actual name starts with that letter.
 * - Multi-character buffer (e.g. 'ma', 'mar', 'bel'): jumps to the first ward
 *   whose actual name starts with the buffer (or ward number / code match).
 */
export function findTypeAheadWardIndex(
  wards: SearchableWardItem[],
  buffer: string,
  currentIndex: number,
  cycleRepeatedChar: boolean
): number {
  const q = normalizeSearchTerm(buffer);
  if (!q || wards.length === 0) return -1;

  const matchesPrefix = (w: SearchableWardItem, prefix: string) => {
    const base = extractWardBaseName(w.name);
    if (base.startsWith(prefix)) return true;
    // Also allow typing digits to jump to a ward number
    if (/^\d+$/.test(prefix) && w.wardNumber != null) {
      return String(w.wardNumber).startsWith(prefix);
    }
    return false;
  };

  if (cycleRepeatedChar && q.length === 1) {
    const start = currentIndex >= 0 ? (currentIndex + 1) % wards.length : 0;
    for (let offset = 0; offset < wards.length; offset++) {
      const idx = (start + offset) % wards.length;
      if (matchesPrefix(wards[idx], q)) {
        return idx;
      }
    }
    return -1;
  }

  // Multi-character prefix search (prefer startsWith, then word-boundary/contains)
  const exactPrefixIdx = wards.findIndex((w) => matchesPrefix(w, q));
  if (exactPrefixIdx !== -1) return exactPrefixIdx;

  return wards.findIndex((w) => matchesWardSearch(w, q));
}
