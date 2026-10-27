import { describe, it, expect } from 'vitest';
import { PRIORITY_CONFIG } from '../../config/priority';
import { isAiFeatureEnabled } from '@/lib/env';

describe('PRIORITY_CONFIG stub', () => {
  it('has valid Priority Index factor weights summing to 1.0', () => {
    const { severity, exposure, vulnerability, usability, persistence } = PRIORITY_CONFIG.weights;
    const sum = severity + exposure + vulnerability + usability + persistence;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('defines valid bands for critical, high, and medium', () => {
    expect(PRIORITY_CONFIG.bands.critical).toBe(70);
    expect(PRIORITY_CONFIG.bands.high).toBe(50);
    expect(PRIORITY_CONFIG.bands.medium).toBe(30);
  });

  it('correctly evaluates default enabled AI features', () => {
    expect(isAiFeatureEnabled('G1')).toBe(true);
    expect(isAiFeatureEnabled('G2')).toBe(true);
    expect(isAiFeatureEnabled('G7')).toBe(true);
    expect(isAiFeatureEnabled('G99')).toBe(false);
  });
});
