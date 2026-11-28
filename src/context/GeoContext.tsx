'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { subscribeIssueUpdates } from '@/lib/map/statusPresentation';

export interface CorporationItem {
  id: string;
  code: string;
  officialId?: string | null;
  name: string;
  shortName: string;
  nameKn?: string | null;
  wardCount: number;
}

export interface WardContextItem {
  id: string;
  code: string;
  officialId?: string | null;
  wardNumber: string | null;
  wardLabel: string;
  name: string;
  nameKn?: string | null;
  fullName: string;
  lat: number;
  lng: number;
  bbox?: [[number, number], [number, number]] | null;
  hasGeometry?: boolean;
  boundaryGeoJson?: GeoJSON.GeoJsonObject | null;
  issueCount?: number;
  isPilot?: boolean;
  isOperationalArea?: boolean;
  corporationId?: string | null;
  corporationCode?: string | null;
  corporationName?: string | null;
  corporationShortName?: string | null;
  departmentCode?: string;
  zoneCode?: string | null;
  zoneName?: string | null;
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
  photoUrl: string | null;
  note: string | null;
  reportCount: number;
  commentCount: number;
  createdAt: string;
  repairClaimedAt?: string | null;
  agencyName?: string | null;
  contractorName?: string | null;
  assignedPersonnel?: string | null;
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

export interface WardPagination {
  total: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface WardDataState {
  issues: WardIssueItem[];
  categoryBreakdown: Record<string, number>;
  stats: WardStats;
  audits: WardAuditItem[];
  pagination?: WardPagination;
  isLoading: boolean;
  error: string | null;
}

export type GeoSelectionMode = 'AUTO' | 'MANUAL';

export type GeoLocationStatus =
  | 'idle'
  | 'detecting'
  | 'resolving'
  | 'detected'
  | 'unavailable'
  | 'denied'
  | 'unsupported'
  | 'no_ward'
  | 'error';

export interface OperationalAreaInfo {
  id: string;
  code: string;
  name: string;
  description?: string;
  issueCount?: number;
  lat?: number;
  lng?: number;
  bbox?: [[number, number], [number, number]] | null;
}

interface GeoContextType {
  role: 'CITIZEN' | 'AUTHORITY' | null;
  currentWard: WardContextItem | null;
  availableWards: WardContextItem[];
  corporations: CorporationItem[];
  availableOperationalAreas: OperationalAreaInfo[];
  selectedOperationalAreaId: string | null;
  department: DepartmentInfo | null;
  isLoading: boolean;
  error: string | null;
  wardData: WardDataState;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectWard: (ward: WardContextItem) => void;
  selectOperationalArea: (area: OperationalAreaInfo | null) => void;
  clearOperationalArea: () => void;
  selectionMode: GeoSelectionMode;
  locationStatus: GeoLocationStatus;
  locationMessage: string | null;
  followLocation: boolean;
  operationalArea: OperationalAreaInfo | null;
  detectMyLocation: (options?: { userInitiated?: boolean }) => Promise<boolean>;
  setFollowLocation: (enabled: boolean) => void;
  refresh: () => Promise<void>;
  refreshWardData: () => Promise<void>;
  loadMoreWardIssues?: () => Promise<void>;
}

const GeoContext = createContext<GeoContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'civicpulse_selected_geo_id';
const LOCAL_STORAGE_WARD_CODE = 'civicpulse_selected_ward_code';
const LOCAL_STORAGE_MODE = 'civicpulse_geo_mode';
const LOCAL_STORAGE_OP_AREA = 'civicpulse_op_area';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_STATS: WardStats = {
  totalReported: 0,
  inProgressCount: 0,
  resolvedCount: 0,
  criticalCount: 0,
  slaBreachedCount: 0,
};

export function GeoContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [role, setRole] = useState<'CITIZEN' | 'AUTHORITY' | null>(null);
  const [currentWard, setCurrentWard] = useState<WardContextItem | null>(null);
  const [availableWards, setAvailableWards] = useState<WardContextItem[]>([]);
  const [corporations, setCorporations] = useState<CorporationItem[]>([]);
  const [availableOperationalAreas, setAvailableOperationalAreas] = useState<OperationalAreaInfo[]>([]);
  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<GeoSelectionMode>('MANUAL');
  const [locationStatus, setLocationStatus] = useState<GeoLocationStatus>('idle');
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [followLocation, setFollowLocationState] = useState(false);
  const [operationalArea, setOperationalArea] = useState<OperationalAreaInfo | null>(null);

  const selectionModeRef = React.useRef<GeoSelectionMode>('MANUAL');
  const roleRef = React.useRef<'CITIZEN' | 'AUTHORITY' | null>(null);
  useEffect(() => {
    selectionModeRef.current = selectionMode;
    roleRef.current = role;
  }, [selectionMode, role]);
  const userIdRef = React.useRef<string | null>(null);
  const lastResolvedCoordsRef = React.useRef<{ lat: number; lng: number; at: number } | null>(null);
  const autoAttemptedRef = React.useRef(false);

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

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshGeoContext = useCallback(async () => {
    setIsLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (pathname.startsWith('/login') || pathname.startsWith('/account/recovery')) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const urlWard = sp?.get('ward') || sp?.get('wardId');
        const fetchUrl = urlWard ? `/api/geo/context?ward=${encodeURIComponent(urlWard)}` : '/api/geo/context';

        const res = await fetch(fetchUrl);
        if (!res.ok) {
          throw new Error(`Failed to load geographical context (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        setRole(data.role);
        userIdRef.current = data.userId || null;
        const wards: WardContextItem[] = data.available || [];
        const opAreas: OperationalAreaInfo[] = data.operationalAreas || [];
        setAvailableWards(wards);
        setCorporations(data.corporations || []);
        setAvailableOperationalAreas(opAreas);
        if (data.department) {
          setDepartment(data.department);
        }

        let resolvedWard: WardContextItem | null = null;
        let initialMode: GeoSelectionMode = 'MANUAL';

        if (urlWard) {
          const lower = urlWard.toLowerCase();
          resolvedWard = wards.find(
            (w) =>
              w.id.toLowerCase() === lower ||
              w.code.toLowerCase() === lower ||
              w.code.toLowerCase() === `ward-${lower}` ||
              w.wardNumber?.toLowerCase() === lower
          ) || null;
          initialMode = 'MANUAL';
        }

        if (!resolvedWard && typeof window !== 'undefined') {
          const roleSuffix = data.role ? `_${data.role}` : '';
          const savedMode = localStorage.getItem(`${LOCAL_STORAGE_MODE}${roleSuffix}`);
          const savedCode = localStorage.getItem(`${LOCAL_STORAGE_WARD_CODE}${roleSuffix}`);
          const savedId = localStorage.getItem(`${LOCAL_STORAGE_KEY}${roleSuffix}`);

          if (savedMode === 'AUTO') {
            initialMode = 'AUTO';
          }

          if (savedCode) {
            resolvedWard = wards.find((w) => w.code.toLowerCase() === savedCode.toLowerCase()) || null;
          }
          if (!resolvedWard && savedId) {
            resolvedWard = wards.find((w) => w.id === savedId) || null;
          }
        }

        setSelectionMode(initialMode);
        selectionModeRef.current = initialMode;
        const nextWard = resolvedWard || data.current || wards[0] || null;
        setCurrentWard(nextWard);

        // Restore ONLY an explicit, still-valid operational area saved for this authenticated user; never default to first/ORR
        if (typeof window !== 'undefined' && data.role === 'AUTHORITY') {
          const userKey = data.userId ? `_${data.userId}` : '';
          const opKey = `${LOCAL_STORAGE_OP_AREA}_${data.role}${userKey}`;
          const savedOpId = localStorage.getItem(opKey);
          if (savedOpId) {
            const matchedOp = opAreas.find((a) => a.id === savedOpId || a.code === savedOpId) || null;
            if (matchedOp) {
              setOperationalArea(matchedOp);
            } else {
              // Saved selection is no longer authorized or available -> clear it
              localStorage.removeItem(opKey);
              setOperationalArea(null);
            }
          } else {
            setOperationalArea(null);
          }
        } else {
          setOperationalArea(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to load location context';
          console.warn('GeoContext fetch error:', err);
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pathname, refreshTrigger]);

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

      setWardData({
        issues: data.issues || [],
        categoryBreakdown: data.categoryBreakdown || {},
        stats: data.stats || DEFAULT_STATS,
        audits: data.audits || [],
        pagination: data.pagination,
        isLoading: false,
        error: null,
      });

      // Lazily hydrate selected ward boundaryGeoJson so we never load all 369 polygons upfront
      if (data.ward?.id === targetWard.id && data.ward?.boundaryGeoJson && !targetWard.boundaryGeoJson) {
        setCurrentWard((prev) =>
          prev && prev.id === targetWard.id
            ? { ...prev, boundaryGeoJson: data.ward.boundaryGeoJson, bbox: data.ward.bbox ?? prev.bbox }
            : prev
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to retrieve ward records';
      console.warn('Error loading ward issues:', err);
      setWardData((prev) => ({
        ...prev,
        isLoading: false,
        error: msg,
      }));
    }
  }, []);

  // Re-fetch ward data ONLY when the ward identity (code/id) or selectedCategory changes
  const currentWardId = currentWard?.code || currentWard?.id || null;
  const lastFetchedKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!currentWard || !currentWardId) return;
    const fetchKey = `${currentWardId}::${selectedCategory}`;
    if (lastFetchedKeyRef.current === fetchKey) return;
    lastFetchedKeyRef.current = fetchKey;

    fetchWardData(currentWard, selectedCategory);
  }, [currentWard, currentWardId, selectedCategory, fetchWardData]);

  const persistGeoPreferences = useCallback(
    (ward: WardContextItem, mode: GeoSelectionMode, targetRole?: 'CITIZEN' | 'AUTHORITY' | null) => {
      if (typeof window === 'undefined') return;
      try {
        const effectiveRole = targetRole ?? roleRef.current;
        const roleSuffix = effectiveRole ? `_${effectiveRole}` : '';
        localStorage.setItem(`${LOCAL_STORAGE_KEY}${roleSuffix}`, ward.id);
        localStorage.setItem(`${LOCAL_STORAGE_WARD_CODE}${roleSuffix}`, ward.code);
        localStorage.setItem(`${LOCAL_STORAGE_MODE}${roleSuffix}`, mode);
        document.cookie = `civicpulse_geo_id=${encodeURIComponent(ward.id)}; path=/; max-age=2592000; SameSite=Lax`;
        document.cookie = `civicpulse_ward_code=${encodeURIComponent(ward.code)}; path=/; max-age=2592000; SameSite=Lax`;
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  // 3. User manually selects a ward (takes priority over automatic location updates)
  const selectWard = useCallback(
    (ward: WardContextItem) => {
      setSelectionMode('MANUAL');
      selectionModeRef.current = 'MANUAL';
      setFollowLocationState(false);
      setLocationStatus('idle');
      setLocationMessage(null);

      setCurrentWard(ward);
      setSelectedCategory('ALL');

      persistGeoPreferences(ward, 'MANUAL');

      startTransition(() => {
        if (typeof window !== 'undefined') {
          const currentParams = new URLSearchParams(window.location.search);
          const wardParam = ward.wardNumber || ward.code.replace(/^ward-/i, '');
          currentParams.set('ward', wardParam);
          const newUrl = `${pathname || window.location.pathname}?${currentParams.toString()}`;
          window.history.pushState(null, '', newUrl);
        }
      });
    },
    [pathname, persistGeoPreferences]
  );

  const resolveCoordinatesToWard = useCallback(
    async (lat: number, lng: number, options?: { userInitiated?: boolean }): Promise<boolean> => {
      const userInitiated = options?.userInitiated ?? false;
      // Never override an active manual selection in the background
      if (!userInitiated && selectionModeRef.current === 'MANUAL') {
        return false;
      }

      setLocationStatus('resolving');
      setLocationMessage('Finding your municipal ward...');

      try {
        const res = await fetch('/api/geo/resolve-ward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
          cache: 'no-store',
        });

        if (!res.ok) {
          setLocationStatus('error');
          setLocationMessage('Network request failed while identifying your ward.');
          return false;
        }

        const data = await res.json();
        lastResolvedCoordsRef.current = { lat, lng, at: Date.now() };
        setOperationalArea(data.operationalArea || null);

        if (!data.matched || !data.ward) {
          setLocationStatus('no_ward');
          setLocationMessage(
            data.message || 'Unable to identify a ward for your location. Please choose one manually.'
          );
          return false;
        }

        // Re-check manual priority in case user selected a ward while request was in flight
        if (!userInitiated && selectionModeRef.current === 'MANUAL') {
          return false;
        }

        const resolvedWard: WardContextItem = data.ward;
        setSelectionMode('AUTO');
        selectionModeRef.current = 'AUTO';
        setCurrentWard(resolvedWard);
        setSelectedCategory('ALL');
        setLocationStatus('detected');
        setLocationMessage(
          data.boundaryMatch
            ? 'Location detected near ward boundary.'
            : 'Location detected.'
        );
        persistGeoPreferences(resolvedWard, 'AUTO');
        return true;
      } catch {
        setLocationStatus('error');
        setLocationMessage('Network request failed while identifying your ward.');
        return false;
      }
    },
    [persistGeoPreferences]
  );

  const detectMyLocation = useCallback(
    async (options?: { userInitiated?: boolean }): Promise<boolean> => {
      const userInitiated = options?.userInitiated ?? true;

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocationStatus('unsupported');
        setLocationMessage('Browser does not support geolocation. Please choose a ward manually.');
        return false;
      }

      if (userInitiated) {
        setSelectionMode('AUTO');
        selectionModeRef.current = 'AUTO';
      }

      setLocationStatus('detecting');
      setLocationMessage('Detecting location...');

      return new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const ok = await resolveCoordinatesToWard(
              pos.coords.latitude,
              pos.coords.longitude,
              { userInitiated }
            );
            resolve(ok);
          },
          (geoErr) => {
            if (geoErr.code === geoErr.PERMISSION_DENIED) {
              setLocationStatus('denied');
              setLocationMessage(
                'Permission denied. You can still choose any ward manually.'
              );
              setFollowLocationState(false);
            } else {
              setLocationStatus('unavailable');
              setLocationMessage(
                'Location unavailable. Please check GPS/device settings or choose a ward manually.'
              );
            }
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    },
    [resolveCoordinatesToWard]
  );

  const setFollowLocation = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        setSelectionMode('AUTO');
        selectionModeRef.current = 'AUTO';
      }
      setFollowLocationState(enabled);
    },
    []
  );

  // Respect previously granted geolocation permission without repeatedly prompting
  useEffect(() => {
    if (isLoading || autoAttemptedRef.current || role !== 'CITIZEN') return;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('ward') || sp.get('wardId')) return;

    const roleSuffix = `_${role}`;
    const savedMode = localStorage.getItem(`${LOCAL_STORAGE_MODE}${roleSuffix}`);
    if (savedMode === 'MANUAL') return;

    autoAttemptedRef.current = true;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            void detectMyLocation({ userInitiated: false });
          }
        })
        .catch(() => {
          // Permissions API unavailable; wait for explicit My Location click
        });
    }
  }, [isLoading, role, detectMyLocation]);

  // Continuous location following (ONLY when explicitly opted in and in AUTO mode)
  useEffect(() => {
    if (!followLocation || selectionMode !== 'AUTO') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (selectionModeRef.current !== 'AUTO') return;
        const { latitude, longitude } = pos.coords;
        const prev = lastResolvedCoordsRef.current;
        if (prev) {
          const movedM = haversineMeters(prev.lat, prev.lng, latitude, longitude);
          const elapsedMs = Date.now() - prev.at;
          if (movedM < 50 || elapsedMs < 15000) {
            return;
          }
        }
        void resolveCoordinatesToWard(latitude, longitude, { userInitiated: false });
      },
      (geoErr) => {
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setLocationStatus('denied');
          setLocationMessage('Permission denied. Continuous location following stopped.');
          setFollowLocationState(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [followLocation, selectionMode, resolveCoordinatesToWard]);

  const selectOperationalArea = useCallback((area: OperationalAreaInfo | null) => {
    setOperationalArea(area);
    if (typeof window !== 'undefined') {
      try {
        const effectiveRole = roleRef.current || 'AUTHORITY';
        const userKey = userIdRef.current ? `_${userIdRef.current}` : '';
        const opKey = `${LOCAL_STORAGE_OP_AREA}_${effectiveRole}${userKey}`;
        if (area) {
          localStorage.setItem(opKey, area.id);
        } else {
          localStorage.removeItem(opKey);
        }
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  const clearOperationalArea = useCallback(() => {
    selectOperationalArea(null);
  }, [selectOperationalArea]);

  // Automatically refresh ward map/issue data whenever an issue status changes in this tab or another tab
  useEffect(() => {
    const handleSync = () => {
      if (currentWard) {
        void fetchWardData(currentWard, selectedCategory);
      }
    };
    const unsubscribe = subscribeIssueUpdates(handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    };
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentWard, selectedCategory, fetchWardData]);

  const loadMoreWardIssues = useCallback(async () => {
    if (!currentWard || !wardData.pagination?.hasMore) return;
    const nextOffset = wardData.pagination.offset + wardData.pagination.returned;
    try {
      const wardIdentifier = currentWard.code || currentWard.id;
      const catParam = selectedCategory && selectedCategory !== 'ALL' ? `&category=${encodeURIComponent(selectedCategory)}` : '';
      const res = await fetch(
        `/api/issues/ward?ward=${encodeURIComponent(wardIdentifier)}${catParam}&offset=${nextOffset}&limit=${wardData.pagination.limit}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setWardData((prev) => {
        const existingIds = new Set(prev.issues.map((i) => i.id));
        const incoming = (data.issues || []).filter((i: WardIssueItem) => !existingIds.has(i.id));
        return {
          ...prev,
          issues: [...prev.issues, ...incoming],
          pagination: data.pagination,
        };
      });
    } catch {
      // keep existing loaded issues
    }
  }, [currentWard, selectedCategory, wardData.pagination]);

  return (
    <GeoContext.Provider
      value={{
        role,
        currentWard,
        availableWards,
        corporations,
        availableOperationalAreas,
        selectedOperationalAreaId: operationalArea?.id ?? null,
        department,
        isLoading,
        error,
        wardData,
        selectedCategory,
        setSelectedCategory,
        selectWard,
        selectOperationalArea,
        clearOperationalArea,
        selectionMode,
        locationStatus,
        locationMessage,
        followLocation,
        operationalArea,
        detectMyLocation,
        setFollowLocation,
        refresh: refreshGeoContext,
        refreshWardData: () => fetchWardData(currentWard, selectedCategory),
        loadMoreWardIssues,
      }}
    >
      {children}
    </GeoContext.Provider>
  );
}

export function useOptionalGeoContext() {
  return useContext(GeoContext);
}

export function useGeoContext() {
  const context = useContext(GeoContext);
  if (!context) {
    throw new Error('useGeoContext must be used within a GeoContextProvider');
  }
  return context;
}
