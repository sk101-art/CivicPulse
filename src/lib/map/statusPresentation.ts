import { Status } from '@prisma/client';

export interface MapStatusMeta {
  key: string;
  label: string;
  shortLabel: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  shape: 'dot' | 'progress' | 'claimed' | 'verified' | 'disputed' | 'reopened';
}

export const MAP_STATUS_META: Record<string, MapStatusMeta> = {
  OPEN: {
    key: 'OPEN',
    label: 'Open',
    shortLabel: 'Open',
    color: '#718F9E',
    badgeBg: '#EFF3F6',
    badgeText: '#718F9E',
    badgeBorder: '#D4E0E7',
    shape: 'dot',
  },
  CONFIRMED: {
    key: 'CONFIRMED',
    label: 'Confirmed',
    shortLabel: 'Open',
    color: '#718F9E',
    badgeBg: '#EFF3F6',
    badgeText: '#718F9E',
    badgeBorder: '#D4E0E7',
    shape: 'dot',
  },
  ASSIGNED: {
    key: 'ASSIGNED',
    label: 'Assigned',
    shortLabel: 'Assigned',
    color: '#718F9E',
    badgeBg: '#F3F4F1',
    badgeText: '#65736B',
    badgeBorder: '#DDDCD3',
    shape: 'dot',
  },
  IN_PROGRESS: {
    key: 'IN_PROGRESS',
    label: 'In Progress',
    shortLabel: 'In Progress',
    color: '#B68B63',
    badgeBg: '#FBF5EB',
    badgeText: '#B68B63',
    badgeBorder: '#F2E2C9',
    shape: 'progress',
  },
  CLAIMED_FIXED: {
    key: 'CLAIMED_FIXED',
    label: 'Repair Claimed — Awaiting Verification',
    shortLabel: 'Repair Claimed',
    color: '#527B7A',
    badgeBg: '#EAF2F0',
    badgeText: '#527B7A',
    badgeBorder: '#D0E2DF',
    shape: 'claimed',
  },
  VERIFIED_FIXED: {
    key: 'VERIFIED_FIXED',
    label: 'Verified Fixed',
    shortLabel: 'Verified Fixed',
    color: '#537C60',
    badgeBg: '#EBF3ED',
    badgeText: '#537C60',
    badgeBorder: '#CDE3D2',
    shape: 'verified',
  },
  DISPUTED: {
    key: 'DISPUTED',
    label: 'Disputed',
    shortLabel: 'Disputed',
    color: '#B76F60',
    badgeBg: '#FBF1EF',
    badgeText: '#B76F60',
    badgeBorder: '#EAC8C1',
    shape: 'disputed',
  },
  REOPENED_IN_WARRANTY: {
    key: 'REOPENED_IN_WARRANTY',
    label: 'Reopened',
    shortLabel: 'Reopened',
    color: '#B68B63',
    badgeBg: '#FBF5EB',
    badgeText: '#B68B63',
    badgeBorder: '#F2E2C9',
    shape: 'reopened',
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'Rejected',
    shortLabel: 'Rejected',
    color: '#929B92',
    badgeBg: '#F3F2EB',
    badgeText: '#65736B',
    badgeBorder: '#DDDCD3',
    shape: 'dot',
  },
};

export function getMapStatusMeta(status: string): MapStatusMeta {
  const norm = (status || 'OPEN').toUpperCase();
  if (norm === 'RESOLVED') return MAP_STATUS_META.VERIFIED_FIXED;
  return MAP_STATUS_META[norm] || MAP_STATUS_META.OPEN;
}

export const MAP_STATUS_FILTER_OPTIONS = [
  { id: 'ALL', label: 'All Statuses', color: '#293732' },
  { id: Status.OPEN, label: 'Open', color: '#718F9E' },
  { id: Status.IN_PROGRESS, label: 'In Progress', color: '#B68B63' },
  { id: Status.CLAIMED_FIXED, label: 'Repair Claimed', color: '#527B7A' },
  { id: Status.VERIFIED_FIXED, label: 'Verified Fixed', color: '#537C60' },
  { id: Status.DISPUTED, label: 'Disputed', color: '#B76F60' },
  { id: Status.REOPENED_IN_WARRANTY, label: 'Reopened', color: '#B68B63' },
] as const;

export function matchesStatusFilter(issueStatus: string, filterId: string): boolean {
  if (!filterId || filterId === 'ALL') return true;
  const norm = (issueStatus || '').toUpperCase();
  if (filterId === Status.OPEN) {
    return norm === Status.OPEN || norm === Status.CONFIRMED || norm === Status.ASSIGNED;
  }
  return norm === filterId;
}

export function getStatusPinInnerSvg(shape: MapStatusMeta['shape'], color: string): string {
  switch (shape) {
    case 'verified':
      return `<path d="M12.5 15 L15 17.5 L19.8 12.5" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    case 'claimed':
      return `<circle cx="16" cy="15" r="4.5" stroke="${color}" stroke-width="1.8" fill="none"/><path d="M16 12.5 V15.2 L17.8 16.2" stroke="${color}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
    case 'disputed':
      return `<path d="M16 11.5 V15.5" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="18" r="1.1" fill="${color}"/>`;
    case 'reopened':
      return `<path d="M12.8 15 A3.3 3.3 0 1 1 16 18.3" stroke="${color}" stroke-width="1.9" stroke-linecap="round" fill="none"/><path d="M11.5 14 L12.8 15.6 L14.4 14.3" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    case 'progress':
      return `<rect x="12.5" y="13.5" width="7" height="3" rx="1.5" fill="${color}"/>`;
    case 'dot':
    default:
      return `<circle cx="16" cy="15" r="3.6" fill="${color}"/>`;
  }
}

export function buildStatusPinHtml(status: string, isSelected: boolean): string {
  const meta = getMapStatusMeta(status);
  const inner = getStatusPinInnerSvg(meta.shape, meta.color);
  return `
    <div style="width: 32px; height: 40px; transform: translate(-16px, -40px); transition: transform 0.2s;" class="${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 38 C16 38 29 24.5 29 15 C29 7.8 23.2 2 16 2 C8.8 2 3 7.8 3 15 C3 24.5 16 38 16 38 Z" fill="${meta.color}" stroke="#FFFFFF" stroke-width="2.5"/>
        <circle cx="16" cy="15" r="7.5" fill="#FFFFFF"/>
        ${inner}
      </svg>
    </div>
  `;
}

const ISSUE_UPDATE_EVENT = 'civicpulse:issue-updated';
const ISSUE_UPDATE_STORAGE_KEY = 'civicpulse_issue_updated_at';

export function notifyIssueUpdated(issueId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ISSUE_UPDATE_STORAGE_KEY,
      JSON.stringify({ issueId: issueId ?? null, ts: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(ISSUE_UPDATE_EVENT, { detail: { issueId, ts: Date.now() } }));
}

export function subscribeIssueUpdates(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = () => onUpdate();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === ISSUE_UPDATE_STORAGE_KEY) {
      onUpdate();
    }
  };
  window.addEventListener(ISSUE_UPDATE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(ISSUE_UPDATE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
