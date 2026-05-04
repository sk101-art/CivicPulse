import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [open, resolved, total, breaches] = await Promise.all([
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.report.count({ where: { status: 'RESOLVED' } }),
      prisma.report.count(),
      prisma.report.count({ where: { slaBreached: true } }),
    ]);

    const efficiency = total > 0 ? Math.round((resolved / total) * 100) : 100;
    
    // Get recent 3 reports for the mock dashboard simulation
    const recentReports = await prisma.report.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        _count: { select: { votes: true } }
      }
    });

    return NextResponse.json({
      open,
      resolved,
      breaches,
      efficiency,
      recentReports
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
