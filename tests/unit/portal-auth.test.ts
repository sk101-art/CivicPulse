import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rateLimit';

describe('Dual-Portal Role-Based Authentication & Security Tests', () => {
  const credentialsProvider = authOptions.providers[0] as any;
  const authorize = credentialsProvider.options.authorize;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearRateLimit('citizen-test@civicpulse.org');
    clearRateLimit('staff-test@civicpulse.local');
    clearRateLimit('inactive@civicpulse.local');
  });

  it('1. Citizen can log in through the Citizen Portal', async () => {
    const hash = await bcrypt.hash('Password@1234', 10);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr-cit-1',
      email: 'citizen-test@civicpulse.org',
      passwordHash: hash,
      role: 'CITIZEN',
      isActive: true,
    } as any);

    const user = await authorize({
      email: 'citizen-test@civicpulse.org',
      password: 'Password@1234',
      portal: 'CITIZEN',
    });

    expect(user).not.toBeNull();
    expect(user?.role).toBe('CITIZEN');
    expect(user?.email).toBe('citizen-test@civicpulse.org');
  });

  it('2. Citizen CANNOT log in through the Municipal Staff Portal', async () => {
    const hash = await bcrypt.hash('Password@1234', 10);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr-cit-2',
      email: 'citizen-test@civicpulse.org',
      passwordHash: hash,
      role: 'CITIZEN',
      isActive: true,
    } as any);

    await expect(
      authorize({
        email: 'citizen-test@civicpulse.org',
        password: 'Password@1234',
        portal: 'STAFF',
      })
    ).rejects.toThrow('CITIZEN_ACCOUNT_ON_STAFF_PORTAL');
  });

  it('3. Municipal Staff can log in through the Municipal Staff Portal', async () => {
    const hash = await bcrypt.hash('Password@1234', 10);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr-staff-1',
      email: 'staff-test@civicpulse.local',
      passwordHash: hash,
      role: 'AUTHORITY',
      isActive: true,
    } as any);

    const user = await authorize({
      email: 'staff-test@civicpulse.local',
      password: 'Password@1234',
      portal: 'STAFF',
    });

    expect(user).not.toBeNull();
    expect(user?.role).toBe('AUTHORITY');
  });

  it('4. Municipal Staff CANNOT log in through the Citizen Portal', async () => {
    const hash = await bcrypt.hash('Password@1234', 10);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr-staff-2',
      email: 'staff-test@civicpulse.local',
      passwordHash: hash,
      role: 'AUTHORITY',
      isActive: true,
    } as any);

    await expect(
      authorize({
        email: 'staff-test@civicpulse.local',
        password: 'Password@1234',
        portal: 'CITIZEN',
      })
    ).rejects.toThrow('STAFF_ACCOUNT_ON_CITIZEN_PORTAL');
  });

  it('5. Inactive accounts are rejected from establishing a session', async () => {
    const hash = await bcrypt.hash('Password@1234', 10);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'usr-inactive',
      email: 'inactive@civicpulse.local',
      passwordHash: hash,
      role: 'AUTHORITY',
      isActive: false,
    } as any);

    await expect(
      authorize({
        email: 'inactive@civicpulse.local',
        password: 'Password@1234',
        portal: 'STAFF',
      })
    ).rejects.toThrow('ACCOUNT_INACTIVE');
  });

  it('6. Rate limiting blocks repeated failed login attempts', async () => {
    const target = 'attacker@civicpulse.org';
    clearRateLimit(target);

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(target);
    }

    const check = checkRateLimit(target);
    expect(check.allowed).toBe(false);
    expect(check.remainingAttempts).toBe(0);
    expect(check.retryAfterSeconds).toBeGreaterThan(0);

    clearRateLimit(target);
  });
});
