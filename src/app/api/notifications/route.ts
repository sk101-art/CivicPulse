import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const categoryLabel = (category: string | null | undefined) =>
  (category || 'Civic issue').replace(/_/g, ' ');

export interface AppNotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  issueId?: string;
  link: string;
  type: 'AUDIT_TASK' | 'ISSUE_UPDATE' | 'POINTS' | 'SLA_BREACH' | 'CRITICAL_HAZARD' | 'SYSTEM';
  read?: boolean;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const role = session.user.role;
    const notifications: AppNotificationItem[] = [];

    if (role === 'CITIZEN') {
      // 1. Audit Tasks: Open verification tasks available to citizen
      try {
        const auditTasks = await prisma.auditTask.findMany({
          where: {
            status: 'OPEN',
            OR: [
              { assigneeId: userId },
              { assigneeId: null },
            ],
          },
          include: {
            issue: {
              select: {
                id: true,
                category: true,
                address: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
        });

        for (const task of auditTasks) {
          const catLabel = (task.issue?.category || 'DEFECT').replace(/_/g, ' ').toLowerCase();
          const kindLabel = task.kind === 'CLAIM_CHECK' ? 'Repair verification' : 'Durability re-check';
          const loc = task.issue?.address || 'nearby location';
          
          notifications.push({
            id: `audit-${task.id}`,
            title: `${kindLabel} assigned`,
            description: `Inspect ${catLabel} at ${loc}`,
            timestamp: task.createdAt.toISOString(),
            issueId: task.issueId,
            link: '/citizen/audit',
            type: 'AUDIT_TASK',
          });
        }
      } catch (err) {
        console.warn('Could not query AuditTasks for notifications:', err);
      }

      // 2. ActionLogs on issues the user reported
      if (userId) {
        try {
          const userReports = await prisma.report.findMany({
            where: { userId },
            select: { issueId: true, id: true },
            take: 20,
          });

          const issueIds = [...new Set(userReports.map((r) => r.issueId))];

          if (issueIds.length > 0) {
            const actions = await prisma.actionLog.findMany({
              where: {
                issueId: { in: issueIds },
                actorId: { not: userId }, // updates made by authority/system
              },
              include: {
                issue: {
                  select: { id: true, category: true, address: true },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            });

            for (const act of actions) {
              const statusText = act.toStatus
                ? `moved to ${act.toStatus.replace(/_/g, ' ').toLowerCase()}`
                : act.action.replace(/_/g, ' ').toLowerCase();

              notifications.push({
                id: `act-${act.id}`,
                title: `Report update • ${act.issue.id}`,
                description: act.note || `Issue status was ${statusText}`,
                timestamp: act.createdAt.toISOString(),
                issueId: act.issue.id,
                link: `/issue/${act.issue.id}`,
                type: 'ISSUE_UPDATE',
              });
            }
          }
        } catch (err) {
          console.warn('Could not query ActionLogs for citizen notifications:', err);
        }
      }

      // 3. PointLogs: Recent reputation milestones
      if (userId) {
        try {
          const profile = await prisma.citizenProfile.findUnique({
            where: { userId },
            select: { id: true },
          });

          if (profile) {
            const points = await prisma.pointLog.findMany({
              where: { citizenId: profile.id },
              orderBy: { createdAt: 'desc' },
              take: 3,
            });

            for (const p of points) {
              notifications.push({
                id: `pts-${p.id}`,
                title: `+${p.points} Reputation Points`,
                description: p.reason || 'Civic verification reward',
                timestamp: p.createdAt.toISOString(),
                link: '/citizen/profile',
                type: 'POINTS',
              });
            }
          }
        } catch (err) {
          console.warn('Could not query PointLogs for citizen notifications:', err);
        }
      }
    } else if (role === 'AUTHORITY') {
      // 1. SLA Breaches
      try {
        const breachedIssues = await prisma.issue.findMany({
          where: {
            slaBreached: true,
            status: { in: ['OPEN', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'DISPUTED'] },
          },
          select: {
            id: true,
            category: true,
            address: true,
            slaDueAt: true,
          },
          orderBy: { slaDueAt: 'asc' },
          take: 4,
        });

        for (const iss of breachedIssues) {
          notifications.push({
            id: `sla-${iss.id}`,
            title: `SLA Breached • ${iss.id}`,
            description: `${categoryLabel(iss.category)} at ${iss.address || 'assigned sector'} overdue`,
            timestamp: iss.slaDueAt.toISOString(),
            issueId: iss.id,
            link: '/desk',
            type: 'SLA_BREACH',
          });
        }
      } catch (err) {
        console.warn('Could not query SLA breaches for notifications:', err);
      }

      // 2. Critical Band Hazards
      try {
        const criticalIssues = await prisma.issue.findMany({
          where: {
            band: 'CRITICAL',
            status: { in: ['OPEN', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] },
          },
          select: {
            id: true,
            category: true,
            address: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
        });

        for (const iss of criticalIssues) {
          notifications.push({
            id: `crit-${iss.id}`,
            title: `Critical Hazard • ${iss.id}`,
            description: `${categoryLabel(iss.category)} logged at ${iss.address || 'ORR corridor'}`,
            timestamp: iss.createdAt.toISOString(),
            issueId: iss.id,
            link: '/desk',
            type: 'CRITICAL_HAZARD',
          });
        }
      } catch (err) {
        console.warn('Could not query critical issues for notifications:', err);
      }

      // 3. Citizen Disputes on repair claims
      try {
        const disputes = await prisma.actionLog.findMany({
          where: { toStatus: 'DISPUTED' },
          include: {
            issue: { select: { id: true, category: true, address: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        });

        for (const d of disputes) {
          notifications.push({
            id: `disp-${d.id}`,
            title: `Repair Claim Disputed • ${d.issue.id}`,
            description: `Ground auditor refuted repair at ${d.issue.address || 'location'}`,
            timestamp: d.createdAt.toISOString(),
            issueId: d.issue.id,
            link: '/desk',
            type: 'ISSUE_UPDATE',
          });
        }
      } catch (err) {
        console.warn('Could not query disputes for notifications:', err);
      }
    }

    // Sort all notifications descending by timestamp
    notifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve notifications' },
      { status: 500 }
    );
  }
}
