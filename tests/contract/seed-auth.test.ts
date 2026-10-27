import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { authOptions } from '@/lib/auth';

describe('T11 Acceptance: Seed and Authentication', () => {
  const seedPassword = process.env.SEED_DESK_PASSWORD;

  const getAuthorize = () => {
    const provider = authOptions.providers.find((p) => p.id === 'credentials') as
      | { options?: { authorize?: (c: Record<string, unknown>) => Promise<unknown> } }
      | undefined;
    expect(provider).toBeDefined();
    return provider?.options?.authorize;
  };

  it('environment contains SEED_DESK_PASSWORD', () => {
    expect(seedPassword).toBeDefined();
    expect(seedPassword!.length).toBeGreaterThanOrEqual(10);
  });

  it('all 7 U7 agencies are present in the database', async () => {
    const agencies = await prisma.agency.findMany();
    const codes = agencies.map((a) => a.code).sort();
    expect(codes).toEqual(['BDA', 'BESCOM', 'BMRCL', 'BTP', 'BWSSB', 'GBA', 'OTHER'].sort());
  });

  it('authenticates desk-a@civicpulse.local with AUTHORITY role', async () => {
    const authorize = getAuthorize();
    expect(authorize).toBeDefined();
    const user = (await authorize!({
      email: 'desk-a@civicpulse.local',
      password: seedPassword,
    })) as { email: string; role: string } | null;

    expect(user).not.toBeNull();
    expect(user!.email).toBe('desk-a@civicpulse.local');
    expect(user!.role).toBe('AUTHORITY');
  });

  it('authenticates desk-b@civicpulse.local with AUTHORITY role', async () => {
    const authorize = getAuthorize();
    expect(authorize).toBeDefined();
    const user = (await authorize!({
      email: 'desk-b@civicpulse.local',
      password: seedPassword,
    })) as { email: string; role: string } | null;

    expect(user).not.toBeNull();
    expect(user!.email).toBe('desk-b@civicpulse.local');
    expect(user!.role).toBe('AUTHORITY');
  });

  it('authenticates citizen@example.com with CITIZEN role', async () => {
    const authorize = getAuthorize();
    expect(authorize).toBeDefined();
    const user = (await authorize!({
      email: 'citizen@example.com',
      password: seedPassword,
    })) as { email: string; role: string } | null;

    expect(user).not.toBeNull();
    expect(user!.email).toBe('citizen@example.com');
    expect(user!.role).toBe('CITIZEN');
  });

  it('rejects invalid password for seeded user', async () => {
    const authorize = getAuthorize();
    expect(authorize).toBeDefined();
    const user = await authorize!({
      email: 'desk-a@civicpulse.local',
      password: 'wrong_password_123',
    });

    expect(user).toBeNull();
  });
});
