import { describe, it, expect } from 'vitest';
import {
  extractWardBaseName,
  matchesWardSearch,
  findTypeAheadWardIndex,
  type SearchableWardItem,
} from '@/lib/geo/wardSearch';

const SAMPLE_WARDS: SearchableWardItem[] = [
  { id: 'w1', code: 'GBA-EAST-001', wardNumber: 1, name: 'Ward 1 · Ramaswamy Palya', corporationName: 'Bengaluru East' },
  { id: 'w2', code: 'GBA-CENTRAL-012', wardNumber: 12, name: 'Ward 12 · Sampangiram Nagar', corporationName: 'Bengaluru Central' },
  { id: 'w3', code: 'GBA-EAST-050', wardNumber: 50, name: 'Ward 50 · Mahadevapura', corporationName: 'Bengaluru East' },
  { id: 'w4', code: 'GBA-EAST-084', wardNumber: 84, name: 'Ward 84 · Marathahalli', corporationName: 'Bengaluru East' },
  { id: 'w5', code: 'GBA-WEST-065', wardNumber: 65, name: 'Ward 65 · Malleshwaram', corporationName: 'Bengaluru West' },
  { id: 'w6', code: 'GBA-SOUTH-150', wardNumber: 150, name: 'Ward 150 · Bellandur', corporationName: 'Bengaluru South' },
];

describe('Ward Type-to-Search & Normalization', () => {
  it('ignores "Ward [number]" prefix when extracting actual ward name', () => {
    expect(extractWardBaseName('Ward 84 · Marathahalli')).toBe('marathahalli');
    expect(extractWardBaseName('Ward 12 - Sampangiram Nagar')).toBe('sampangiram nagar');
  });

  it('jumps to M, Ma, Mar and B, Bel accurately without matching "Ward"', () => {
    const idxM = findTypeAheadWardIndex(SAMPLE_WARDS, 'M', -1, false);
    expect(SAMPLE_WARDS[idxM].id).toBe('w3'); // Mahadevapura

    const idxMar = findTypeAheadWardIndex(SAMPLE_WARDS, 'Mar', -1, false);
    expect(SAMPLE_WARDS[idxMar].id).toBe('w4'); // Marathahalli

    const idxB = findTypeAheadWardIndex(SAMPLE_WARDS, 'B', -1, false);
    expect(SAMPLE_WARDS[idxB].id).toBe('w6'); // Bellandur

    const idxBel = findTypeAheadWardIndex(SAMPLE_WARDS, 'Bel', -1, false);
    expect(SAMPLE_WARDS[idxBel].id).toBe('w6'); // Bellandur
  });

  it('cycles through matching wards on repeated single-character key presses', () => {
    const first = findTypeAheadWardIndex(SAMPLE_WARDS, 'm', -1, false);
    expect(SAMPLE_WARDS[first].id).toBe('w3'); // Mahadevapura

    const second = findTypeAheadWardIndex(SAMPLE_WARDS, 'm', first, true);
    expect(SAMPLE_WARDS[second].id).toBe('w4'); // Marathahalli

    const third = findTypeAheadWardIndex(SAMPLE_WARDS, 'm', second, true);
    expect(SAMPLE_WARDS[third].id).toBe('w5'); // Malleshwaram

    const wrapped = findTypeAheadWardIndex(SAMPLE_WARDS, 'm', third, true);
    expect(SAMPLE_WARDS[wrapped].id).toBe('w3'); // Wraps back to Mahadevapura
  });

  it('matches by ward number, code, corporation, and normalized separators', () => {
    expect(matchesWardSearch(SAMPLE_WARDS[5], '150')).toBe(true);
    expect(matchesWardSearch(SAMPLE_WARDS[5], 'gba south 150')).toBe(true);
    expect(matchesWardSearch(SAMPLE_WARDS[1], 'sampangiram')).toBe(true);
    expect(matchesWardSearch(SAMPLE_WARDS[0], 'zzzzz')).toBe(false);
  });
});
