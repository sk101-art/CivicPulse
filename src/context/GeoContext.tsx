'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface WardContextItem {
  id: string;
  code: string;
  wardNumber: string | null;
  wardLabel: string;
  name: string;
  fullName: string;
  lat: number;
  lng: number;
  bbox?: [[number, number], [number, number]] | null;
  hasGeometry?: boolean;
  boundaryGeoJson?: any;
  issueCount?: number;
  isPilot?: boolean;
  departmentCode?: string;
  zoneName?: string;
}

export interface DepartmentInfo {
  departmentCode: string;
  departmentName: string;
  deskTitle: string;
  assignedZone: string;
  defaultWardCode: string;
}

export interface WardIssueItem {
  id: string;
  category: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  latitude: number;
  longitude: number;
  status: string;
  statusLabel: string;
  priority: string;
  priorityScore: number;
  slaBreached: boolean;
  slaDueAt: string;
  photoUrl: string;
  note: string | null;
  reportCount: number;
  commentCount: number;
  createdAt: string;
}

export interface WardStats {
  totalReported: number;
  inProgressCount: number;
  resolvedCount: number;
  criticalCount: number;
  slaBreachedCount: number;
}

export interface WardAuditItem {
  id: string;
  issueId: string;
  kind: string;
  category: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  dueAt: string;
}

export interface WardDataState {
  issues: WardIssueItem[];
  categoryBreakdown: Record<string, number>;
  stats: WardStats;
  audits: WardAuditItem[];
  isLoading: boolean;
  error: string | null;
}

interface GeoContextType {
  role: 'CITIZEN' | 'AUTHORITY' | null;
  currentWard: WardContextItem | null;
  availableWards: WardContextItem[];
  department: DepartmentInfo | null;
  isLoading: boolean;
  error: string | null;
  wardData: WardDataState;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectWard: (ward: WardContextItem) => void;
  refresh: () => Promise<void>;
  refreshWardData: () => Promise<void>;
}

const GeoContext = createContext<GeoContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'civicpulse_selected_geo_id';
const LOCAL_STORAGE_WARD_CODE = 'civicpulse_selected_ward_code';

const DEFAULT_STATS: WardStats = {
  totalReported: 0,
  inProgressCount: 0,
  resolvedCount: 0,
  criticalCount: 0,
  slaBreachedCount: 0,
};

export function GeoContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<'CITIZEN' | 'AUTHORITY' | null>(null);
  const [currentWard, setCurrentWard] = useState<WardContextItem | null>(null);
  const [availableWards, setAvailableWards] = useState<WardContextItem[]>([]);
  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Category filter for the ward
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Dynamic ward-based data state
  const [wardData, setWardData] = useState<WardDataState>({
    issues: [],
    categoryBreakdown: {},
    stats: DEFAULT_STATS,
    audits: [],
    isLoading: true,
    error: null,
  });

  // 1. Fetch available wards & default ward context
  const fetchGeoContext = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const urlWard = searchParams?.get('ward') || searchParams?.get('wardId');
      const fetchUrl = urlWard ? `/api/geo/context?ward=${encodeURIComponent(urlWard)}` : '/api/geo/context';

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`Failed to load geographical context (${res.status})`);
      }
      const data = await res.json();

      setRole(data.role);
      const wards: WardContextItem[] = data.available || [];
      setAvailableWards(wards);
      if (data.department) {
        setDepartment(data.department);
      }

      // Priority resolution:
      // 1. URL search param
      // 2. Saved preference in localStorage
      // 3. API default (data.current)
      let resolvedWard: WardContextItem | null = null;
      if (urlWard) {
        const lower = urlWard.toLowerCase();
        resolvedWard = wards.find(
          (w) =>
            w.id.toLowerCase() === lower ||
            w.code.toLowerCase() === lower ||
            w.code.toLowerCase() === `ward-${lower}` ||
            w.wardNumber?.toLowerCase() === lower
        ) || null;
      }

      if (!resolvedWard && typeof window !== 'undefined') {
        const savedCode = localStorage.getItem(LOCAL_STORAGE_WARD_CODE);
        const savedId = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedCode) {
          resolvedWard = wards.find((w) => w.code.toLowerCase() === savedCode.toLowerCase()) || null;
        }
        if (!resolvedWard && savedId) {
          resolvedWard = wards.find((w) => w.id === savedId) || null;
        }
      }

      setCurrentWard(resolvedWard || data.current || wards[0] || null);
    } catch (err: any) {
      console.warn('GeoContext fetch error:', err);
      setError(err.message || 'Unable to load location context');
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchGeoContext();
  }, [fetchGeoContext]);

  // 2. Fetch actual ward issues, statistics, category breakdown, and audits
  const fetchWardData = useCallback(async (targetWard: WardContextItem | null, category: string) => {
    if (!targetWard) return;

    setWardData((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const wardIdentifier = targetWard.code || targetWard.id;
      const catParam = category && category !== 'ALL' ? `&category=${encodeURIComponent(category)}` : '';
      const res = await fetch(`/api/issues/ward?ward=${encodeURIComponent(wardIdentifier)}${catParam}`);

      if (!res.ok) {
        throw new Error(`Failed to load ward data (${res.status})`);
      }
      const data = await res.json();

      if (data.ward) {
        setCurrentWard((prev) => {
          if (!prev || (prev.id !== data.ward.id && prev.code !== data.ward.code)) return prev;
          return {
            ...prev,
            bbox: data.ward.bbox || prev.bbox,
            hasGeometry: data.ward.hasGeometry ?? prev.hasGeometry,
            boundaryGeoJson: data.ward.boundaryGeoJson || prev.boundaryGeoJson,
            lat: data.ward.lat ?? prev.lat,
            lng: data.ward.lng ?? prev.lng,
          };
        });
      }

      setWardData({
        issues: data.issues || [],
        categoryBreakdown: data.categoryBreakdown || {},
        stats: data.stats || DEFAULT_STATS,
        audits: data.audits || [],
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      console.warn('Error loading ward issues:', err);
      setWardData((prev) => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Unable to retrieve ward records',
      }));
    }
  }, []);

  // Re-fetch ward data whenever currentWard or selectedCategory changes
  useEffect(() => {
    if (currentWard) {
      fetchWardData(currentWard, selectedCategory);
    }
  }, [currentWard, selectedCategory, fetchWardData]);

  // 3. User selects a different ward
  const selectWard = useCallback(
    (ward: WardContextItem) => {
      // 1. Immediately update state
      setCurrentWard(ward);
      // Reset category filter when switching wards to show full overview
      setSelectedCategory('ALL');

      // 2. Persist in localStorage and document cookie
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, ward.id);
          localStorage.setItem(LOCAL_STORAGE_WARD_CODE, ward.code);
          document.cookie = `civicpulse_geo_id=${encodeURIComponent(ward.id)}; path=/; max-age=2592000; SameSite=Lax`;
          document.cookie = `civicpulse_ward_code=${encodeURIComponent(ward.code)}; path=/; max-age=2592000; SameSite=Lax`;
        } catch {
          // ignore storage errors
        }
      }

      // 3. Update URL query parameter without a full page reload
      startTransition(() => {
        const currentParams = new URLSearchParams(searchParams?.toString() || '');
        const wardParam = ward.wardNumber || ward.code.replace(/^ward-/i, '');
        currentParams.set('ward', wardParam);

        const newUrl = `${pathname}?${currentParams.toString()}`;
        // Use history.pushState so the address bar reflects the ward and browser back/forward works
        if (typeof window !== 'undefined') {
          window.history.pushState(null, '', newUrl);
        }
      });
    },
    [pathname, searchParams]
  );

  return (
    <GeoContext.Provider
      value={{
        role,
        currentWard,
        availableWards,
        department,
        isLoading,
        error,
        wardData,
        selectedCategory,
        setSelectedCategory,
        selectWard,
        refresh: fetchGeoContext,
        refreshWardData: () => fetchWardData(currentWard, selectedCategory),
      }}
    >
      {children}
    </GeoContext.Provider>
  );
}

export function useGeoContext() {
  const context = useContext(GeoContext);
  if (!context) {
    throw new Error('useGeoContext must be used within a GeoContextProvider');
  }
  return context;
}
