import { AssignmentStatus, Status } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type DerivedDutyStatus = 'Active' | 'On Duty' | 'Inactive';

export interface PersonnelAssignmentItem {
  id: string;
  issueId: string;
  assignmentStatus: AssignmentStatus;
  assignedAt: string;
  completedAt: string | null;
  category: string;
  address: string | null;
  issueStatus: Status;
  priority: number;
  band: string;
  slaDueAt: string;
  slaBreached: boolean;
}

export interface PersonnelWorkloadSummary {
  activeCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  overdueCount: number;
}

export interface EnrichedPersonnel {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
  dutyStatus: DerivedDutyStatus;
  createdAt: string;
  updatedAt: string;
  workload: PersonnelWorkloadSummary;
  activeAssignments: PersonnelAssignmentItem[];
  historicalAssignments: PersonnelAssignmentItem[];
}

export interface PersonnelFilterOptions {
  search?: string;
  role?: string;
  status?: string; // 'ALL' | 'ACTIVE' | 'ON_DUTY' | 'INACTIVE' | 'ELIGIBLE'
}

const TERMINAL_ISSUE_STATUSES = new Set<Status>([Status.VERIFIED_FIXED, Status.REJECTED]);

export function enrichPersonnelRecord(p: {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignments: Array<{
    id: string;
    issueId: string;
    status: AssignmentStatus;
    createdAt: Date;
    completedAt: Date | null;
    issue: {
      id: string;
      category: string;
      address: string | null;
      status: Status;
      priority: number;
      band: string;
      bandOverride: string | null;
      slaDueAt: Date;
      slaBreached: boolean;
    };
  }>;
}): EnrichedPersonnel {
  const activeIssueMap = new Map<string, PersonnelAssignmentItem>();
  const historicalList: PersonnelAssignmentItem[] = [];
  const completedIssueIds = new Set<string>();

  for (const a of p.assignments) {
    const item: PersonnelAssignmentItem = {
      id: a.id,
      issueId: a.issueId,
      assignmentStatus: a.status,
      assignedAt: a.createdAt.toISOString(),
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      category: a.issue.category,
      address: a.issue.address,
      issueStatus: a.issue.status,
      priority: a.issue.priority,
      band: a.issue.bandOverride || a.issue.band,
      slaDueAt: a.issue.slaDueAt.toISOString(),
      slaBreached: a.issue.slaBreached,
    };

    const isCompletedAssignment =
      a.status === AssignmentStatus.COMPLETED || TERMINAL_ISSUE_STATUSES.has(a.issue.status);

    if (isCompletedAssignment) {
      historicalList.push(item);
      completedIssueIds.add(a.issueId);
    } else if (!activeIssueMap.has(a.issueId)) {
      activeIssueMap.set(a.issueId, item);
    }
  }

  const activeAssignments = Array.from(activeIssueMap.values());
  const pendingCount = activeAssignments.filter(
    (a) => a.assignmentStatus === AssignmentStatus.PENDING
  ).length;
  const inProgressCount = activeAssignments.filter(
    (a) => a.assignmentStatus === AssignmentStatus.IN_PROGRESS
  ).length;
  const overdueCount = activeAssignments.filter((a) => a.slaBreached).length;

  const dutyStatus: DerivedDutyStatus = !p.active
    ? 'Inactive'
    : activeAssignments.length > 0
      ? 'On Duty'
      : 'Active';

  return {
    id: p.id,
    name: p.name,
    role: p.role,
    contact: p.contact,
    active: p.active,
    dutyStatus,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    workload: {
      activeCount: activeAssignments.length,
      pendingCount,
      inProgressCount,
      completedCount: completedIssueIds.size,
      overdueCount,
    },
    activeAssignments,
    historicalAssignments: historicalList.slice(0, 20),
  };
}

export async function listEnrichedPersonnels(
  filters: PersonnelFilterOptions = {}
): Promise<EnrichedPersonnel[]> {
  const { search, role, status } = filters;

  const rows = await prisma.personnel.findMany({
    where: {
      ...(role && role !== 'ALL' ? { role } : {}),
      ...(status === 'INACTIVE' ? { active: false } : {}),
      ...(status === 'ACTIVE' || status === 'ON_DUTY' || status === 'ELIGIBLE'
        ? { active: true }
        : {}),
      ...(search && search.trim()
        ? {
            OR: [
              { id: { contains: search.trim(), mode: 'insensitive' } },
              { name: { contains: search.trim(), mode: 'insensitive' } },
              { role: { contains: search.trim(), mode: 'insensitive' } },
              { contact: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      assignments: {
        orderBy: { createdAt: 'desc' },
        include: {
          issue: {
            select: {
              id: true,
              category: true,
              address: true,
              status: true,
              priority: true,
              band: true,
              bandOverride: true,
              slaDueAt: true,
              slaBreached: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  let enriched = rows.map(enrichPersonnelRecord);

  if (status === 'ON_DUTY') {
    enriched = enriched.filter((p) => p.dutyStatus === 'On Duty');
  } else if (status === 'ACTIVE') {
    enriched = enriched.filter((p) => p.dutyStatus === 'Active');
  }

  return enriched;
}
