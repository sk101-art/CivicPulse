import { Status } from '@prisma/client';

/** Closed issues: hidden from the desk queue unless explicitly requested. */
export const CLOSED_STATUSES: Status[] = [Status.VERIFIED_FIXED, Status.REJECTED];

/**
 * Status filter for the desk queue. An explicit status selection wins; otherwise closed issues are
 * excluded unless `includeClosed` is set.
 */
export function deskStatusFilter(
  statusParam: string | null | undefined,
  includeClosed: boolean
): { in: Status[] } | { notIn: Status[] } | undefined {
  if (statusParam && statusParam !== 'ALL') {
    return { in: statusParam.split(',').map((s) => s.trim()) as Status[] };
  }
  return includeClosed ? undefined : { notIn: CLOSED_STATUSES };
}
