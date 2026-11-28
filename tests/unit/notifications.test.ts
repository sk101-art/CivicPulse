import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/notifications/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));

describe('Authority notifications', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps SLA alerts available when a legacy issue has no category', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'desk-1', role: 'AUTHORITY', email: 'desk@example.test' },
      expires: '2099-01-01',
    } as never);

    vi.spyOn(prisma.issue, 'findMany')
      .mockResolvedValueOnce([{
        id: 'issue-legacy',
        category: null,
        address: null,
        slaDueAt: new Date('2026-01-01T00:00:00.000Z'),
      }] as never)
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.actionLog, 'findMany').mockResolvedValue([] as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notifications).toContainEqual(expect.objectContaining({
      id: 'sla-issue-legacy',
      description: 'Civic issue at assigned sector overdue',
    }));
  });
});
