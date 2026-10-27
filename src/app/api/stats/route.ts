import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [open, resolved, total, breaches] = await Promise.all([
      prisma.issue.count({ where: { status: 'OPEN' } }),
      prisma.issue.count({ where: { status: { in: ['CLAIMED_FIXED', 'VERIFIED_FIXED'] } } }),
      prisma.issue.count(),
      prisma.issue.count({ where: { slaBreached: true } }),
    ]);

    const efficiency = total > 0 ? Math.round((resolved / total) * 100) : 100;

    // Get recent 3 issues for the dashboard simulation
    const recentIssues = await prisma.issue.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        category: true,
        status: true,
        createdAt: true,
        address: true,
        _count: { select: { reports: true } }
      }
    });

    const recentReports = recentIssues.map((i) => ({
      id: i.id,
      title: `${i.category.replace(/_/g, ' ')} at ${i.address || 'Bengaluru'}`,
      category: i.category,
      status: i.status,
      createdAt: i.createdAt,
      _count: { votes: i._count.reports }
    }));

    return NextResponse.json({
      open,
      resolved,
      breaches,
      efficiency,
      recentReports
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
