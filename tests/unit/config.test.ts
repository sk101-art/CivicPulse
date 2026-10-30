import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
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

  it('deploy schema verification script succeeds for public and fails if schema is test', () => {
    const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://user:pass@host:5432/postgres?schema=public';
    // 1. Production URL run targets public
    const out = execSync('node scripts/verify-deploy-schema.mjs', {
      encoding: 'utf8',
      env: {
        ...process.env,
        DIRECT_DATABASE_URL: prodUrl,
        APP_DATABASE_URL: prodUrl,
      },
    });
    expect(out).toContain('[build] Prisma migrate deploy target schema: public');
    expect(out).toContain('Schema check passed');

    // 2. Simulated run with DIRECT_DATABASE_URL targeting schema=test must fail
    expect(() => {
      execSync('node scripts/verify-deploy-schema.mjs', {
        encoding: 'utf8',
        env: {
          ...process.env,
          DIRECT_DATABASE_URL: 'postgresql://user:pass@host:5432/db?schema=test',
        },
      });
    }).toThrow();
  });
});
