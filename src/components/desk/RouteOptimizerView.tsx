'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Navigation,
  Users,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Send,
  Loader2,
  Search,
  History,
  X,
  LocateFixed,
} from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';
import { CartoTileLayer, CartoConfigNotice } from '@/components/map/CartoTileLayer';
import { subscribeIssueUpdates, notifyIssueUpdated, getMapStatusMeta } from '@/lib/map/statusPresentation';
import { formatDateTimeIST } from '@/lib/time/ist';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const WardViewportSync = dynamic(
  () => import('@/components/map/WardViewportSync').then((mod) => mod.WardViewportSync),
  { ssr: false }
);

interface Personnel {
  id: string;
  name: string;
  role: string;
  contact: string;
  active: boolean;
  dutyStatus?: string;
  workload?: {
    activeCount: number;
  };
}

export interface IssueItem {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  band?: string;
  priorityScore: number;
  status: string;
  address?: string;
  wardId?: string | null;
  slaDueAt?: string;
  slaBreached?: boolean;
  agencyName?: string | null;
  assignedPersonnel?: string | null;
}

interface SavedDispatchRoute {
  id: string;
  name: string;
  vehicle: string;
  createdAt: string;
  geomJson: {
    status?: string;
    personnelName?: string;
    personnelRole?: string;
    stopIssueIds?: string[];
    totalDistanceM?: number | null;
    totalDurationS?: number | null;
    routeSource?: string;
    confirmedAt?: string;
  };
}

interface RouteOptimizerViewProps {
  initialReports: IssueItem[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatShortId(id: string): string {
  if (id.startsWith('CP-')) return id;
  return `CP-${id.slice(-4).toUpperCase()}`;
}

export function RouteOptimizerView({ initialReports }: RouteOptimizerViewProps) {
  const router = useRouter();
  const { currentWard } = useGeoContext();

  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('');
  const [issues, setIssues] = useState<IssueItem[]>(initialReports);

  // Work order filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bandFilter, setBandFilter] = useState('ALL');

  // Start location mode
  const [startMode, setStartMode] = useState<'WARD_CENTER' | 'GPS' | 'FIRST_STOP'>('WARD_CENTER');
  const [gpsStart, setGpsStart] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Selection & Route state
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<IssueItem[]>([]);
  const [roadCoords, setRoadCoords] = useState<[number, number][] | null>(null);
  const [roadDistanceM, setRoadDistanceM] = useState<number | null>(null);
  const [roadDurationS, setRoadDurationS] = useState<number | null>(null);
  const [routeSource, setRouteSource] = useState<'TOMTOM_ROAD' | 'STRAIGHT_LINE_FALLBACK'>('STRAIGHT_LINE_FALLBACK');
  const [routeNotice, setRouteNotice] = useState<string | null>(null);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Dispatch history
  const [showHistory, setShowHistory] = useState(false);
  const [dispatchHistory, setDispatchHistory] = useState<SavedDispatchRoute[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchPersonnel = useCallback(async () => {
    try {
      const res = await fetch('/api/personnels?status=ELIGIBLE', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const activeOnly = data.filter((p: Personnel) => p.active !== false);
          setPersonnels(activeOnly);
          if (activeOnly.length > 0) {
            setSelectedPersonnelId((prev) =>
              activeOnly.some((p: Personnel) => p.id === prev) ? prev : activeOnly[0].id
            );
          } else {
            setSelectedPersonnelId('');
          }
          return;
        }
      }
      setDispatchError('Unable to load active field personnel from directory.');
    } catch (err) {
      console.warn('Failed to load personnels:', err);
      setDispatchError('Network error loading field personnel directory.');
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/desk/dispatch', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDispatchHistory(data.routes || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void fetchPersonnel();
    const unsubscribe = subscribeIssueUpdates(() => {
      void fetchPersonnel();
      router.refresh();
    });
    return () => unsubscribe();
  }, [fetchPersonnel, router]);

  useEffect(() => {
    setIssues(initialReports);
  }, [initialReports]);

  // Filter work orders by ward scope, category, status, band, and search
  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (!Number.isFinite(i.latitude) || !Number.isFinite(i.longitude)) return false;
      if (
        currentWard &&
        currentWard.code !== 'ALL' &&
        currentWard.id !== 'zone-all' &&
        !currentWard.isOperationalArea &&
        i.wardId &&
        i.wardId !== currentWard.id
      ) {
        return false;
      }
      if (categoryFilter !== 'ALL' && i.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && i.status !== statusFilter) return false;
      if (bandFilter !== 'ALL' && (i.band || 'MEDIUM') !== bandFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hay = `${i.id} ${formatShortId(i.id)} ${i.title} ${i.address || ''} ${i.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, currentWard, categoryFilter, statusFilter, bandFilter, searchQuery]);

  // Pre-select top 5 filtered work orders when scope changes and nothing is selected
  useEffect(() => {
    setSelectedIssueIds((prev) => {
      const validSet = new Set(filteredIssues.map((i) => i.id));
      const kept = prev.filter((id) => validSet.has(id));
      if (kept.length > 0) return kept;
      return filteredIssues.slice(0, 5).map((i) => i.id);
    });
    setOptimizedRoute([]);
    setRoadCoords(null);
    setRoadDistanceM(null);
    setRoadDurationS(null);
    setDispatchSuccess(null);
  }, [filteredIssues]);

  const activePersonnel = useMemo(() => {
    return personnels.find((p) => p.id === selectedPersonnelId) || personnels[0];
  }, [personnels, selectedPersonnelId]);

  const startLocation = useMemo(() => {
    if (startMode === 'GPS' && gpsStart) {
      return { label: 'Current GPS Location', lat: gpsStart.lat, lng: gpsStart.lng };
    }
    if (startMode === 'FIRST_STOP' && optimizedRoute.length > 0) {
      return {
        label: `First Stop (${formatShortId(optimizedRoute[0].id)})`,
        lat: optimizedRoute[0].latitude,
        lng: optimizedRoute[0].longitude,
      };
    }
    if (currentWard?.lat && currentWard?.lng) {
      return {
        label: `${currentWard.wardLabel || 'Ward'} Base`,
        lat: currentWard.lat,
        lng: currentWard.lng,
      };
    }
    return { label: 'Bengaluru Central Base', lat: 12.9716, lng: 77.5946 };
  }, [startMode, gpsStart, optimizedRoute, currentWard]);

  const requestGpsStart = () => {
    setGpsError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Browser geolocation is unavailable.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStartMode('GPS');
      },
      () => {
        setGpsError('Unable to obtain GPS location. Using Ward Base.');
        setStartMode('WARD_CENTER');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const toggleIssueSelection = (id: string) => {
    setSelectedIssueIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setOptimizedRoute([]);
    setRoadCoords(null);
    setRoadDistanceM(null);
    setRoadDurationS(null);
    setDispatchSuccess(null);
  };

  const fetchRoadGeometryForSequence = async (
    sequence: IssueItem[],
    originPoint: { lat: number; lng: number }
  ) => {
    if (sequence.length === 0) return;

    const allPoints: [number, number][] =
      startMode === 'FIRST_STOP'
        ? sequence.map((s) => [s.latitude, s.longitude] as [number, number])
        : [[originPoint.lat, originPoint.lng] as [number, number], ...sequence.map((s) => [s.latitude, s.longitude] as [number, number])];

    if (allPoints.length < 2) {
      setRoadCoords(null);
      setRoadDistanceM(0);
      setRoadDurationS(null);
      setRouteSource('STRAIGHT_LINE_FALLBACK');
      setRouteNotice('Single stop selected — add another stop or use Ward Base start for road routing.');
      return;
    }

    try {
      const origin = allPoints[0];
      const destination = allPoints[allPoints.length - 1];
      const waypoints = allPoints.slice(1, -1);

      const res = await fetch('/api/routes/safe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: origin[0], longitude: origin[1] },
          destination: { latitude: destination[0], longitude: destination[1] },
          waypoints: waypoints.map(([lat, lon]) => ({ latitude: lat, longitude: lon })),
          travelMode: 'car',
          maxAlternatives: 0,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const primary = data?.routes?.[0];
        if (primary && Array.isArray(primary.coords) && primary.coords.length > 1) {
          setRoadCoords(primary.coords as [number, number][]);
          setRoadDistanceM(primary.distance ?? null);
          setRoadDurationS(primary.duration ?? null);
          setRouteSource('TOMTOM_ROAD');
          setRouteNotice(null);
          return;
        }
      }
    } catch (err) {
      console.warn('Road routing provider unavailable:', err);
    }

    // Explicit fallback notice — never present straight-line distance as actual road driving distance
    setRoadCoords(null);
    setRoadDistanceM(null);
    setRoadDurationS(null);
    setRouteSource('STRAIGHT_LINE_FALLBACK');
    setRouteNotice('Road routing provider unavailable — showing straight-line sequence (no road travel time fabricated).');
  };

  // Calculate practical visit sequence from startLocation
  const handleCalculateRoute = async () => {
    const selected = filteredIssues.filter((i) => selectedIssueIds.includes(i.id));
    if (selected.length === 0) return;

    setIsOptimizing(true);
    setDispatchSuccess(null);
    setDispatchError(null);
    setRouteNotice(null);

    try {
      const unvisited = [...selected].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      const sequence: IssueItem[] = [];

      let curLat = startLocation.lat;
      let curLng = startLocation.lng;

      if (startMode === 'FIRST_STOP') {
        const first = unvisited.shift()!;
        sequence.push(first);
        curLat = first.latitude;
        curLng = first.longitude;
      }

      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minScore = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
          const distKm = haversineKm(curLat, curLng, unvisited[i].latitude, unvisited[i].longitude);
          // Weight distance slightly by SLA breach / priority so urgent stops stay prioritized
          const slaBoost = unvisited[i].slaBreached ? 0.75 : 1.0;
          const score = distKm * slaBoost;
          if (score < minScore) {
            minScore = score;
            nearestIdx = i;
          }
        }

        const nextStop = unvisited.splice(nearestIdx, 1)[0];
        sequence.push(nextStop);
        curLat = nextStop.latitude;
        curLng = nextStop.longitude;
      }

      setOptimizedRoute(sequence);
      await fetchRoadGeometryForSequence(sequence, startLocation);
    } finally {
      setIsOptimizing(false);
    }
  };

  const moveStop = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= optimizedRoute.length) return;
    const nextSeq = [...optimizedRoute];
    const [moved] = nextSeq.splice(index, 1);
    nextSeq.splice(targetIdx, 0, moved);
    setOptimizedRoute(nextSeq);
    setIsOptimizing(true);
    await fetchRoadGeometryForSequence(nextSeq, startLocation);
    setIsOptimizing(false);
  };

  const removeStop = async (issueId: string) => {
    const nextSeq = optimizedRoute.filter((s) => s.id !== issueId);
    setSelectedIssueIds((prev) => prev.filter((id) => id !== issueId));
    setOptimizedRoute(nextSeq);
    if (nextSeq.length > 0) {
      setIsOptimizing(true);
      await fetchRoadGeometryForSequence(nextSeq, startLocation);
      setIsOptimizing(false);
    } else {
      setRoadCoords(null);
      setRoadDistanceM(null);
      setRoadDurationS(null);
    }
  };

  // Straight-line fallback distance when road provider is unavailable
  const straightLineKm = useMemo(() => {
    if (optimizedRoute.length === 0) return 0;
    let total = 0;
    let prevLat = startMode === 'FIRST_STOP' ? optimizedRoute[0].latitude : startLocation.lat;
    let prevLng = startMode === 'FIRST_STOP' ? optimizedRoute[0].longitude : startLocation.lng;
    for (const stop of optimizedRoute) {
      total += haversineKm(prevLat, prevLng, stop.latitude, stop.longitude);
      prevLat = stop.latitude;
      prevLng = stop.longitude;
    }
    return Number(total.toFixed(2));
  }, [optimizedRoute, startLocation, startMode]);

  const polylinePositions = useMemo(() => {
    if (roadCoords && roadCoords.length > 1) return roadCoords;
    return optimizedRoute.map((item) => [item.latitude, item.longitude] as [number, number]);
  }, [roadCoords, optimizedRoute]);

  const slaBreachedStops = useMemo(
    () => optimizedRoute.filter((s) => s.slaBreached).length,
    [optimizedRoute]
  );

  const handleConfirmDispatch = async () => {
    if (!activePersonnel || optimizedRoute.length === 0) return;
    setIsDispatching(true);
    setDispatchError(null);
    setDispatchSuccess(null);

    try {
      const res = await fetch('/api/desk/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnelId: activePersonnel.id,
          issueIds: optimizedRoute.map((stop) => stop.id),
          vehicle: 'car',
          startLocation,
          totalDistanceM: roadDistanceM ?? Math.round(straightLineKm * 1000),
          totalDurationS: roadDurationS,
          routeSource,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to dispatch route');
      }

      setShowConfirmModal(false);
      setDispatchSuccess(
        `Confirmed dispatch of ${data.dispatchedCount ?? optimizedRoute.length} work orders to ${activePersonnel.name}.`
      );
      notifyIssueUpdated();
      void fetchPersonnel();
      void fetchHistory();
      router.refresh();
    } catch (err: unknown) {
      setDispatchError(err instanceof Error ? err.message : 'Failed to dispatch route');
    } finally {
      setIsDispatching(false);
    }
  };

  const mapCenter: [number, number] = useMemo(() => {
    if (optimizedRoute.length > 0) {
      return [optimizedRoute[0].latitude, optimizedRoute[0].longitude];
    }
    if (currentWard?.lat && currentWard?.lng) {
      return [currentWard.lat, currentWard.lng];
    }
    return [12.9716, 77.5946];
  }, [optimizedRoute, currentWard]);

  const getStopPinIcon = useCallback((index: number) => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    return L.divIcon({
      className: 'route-stop-marker',
      html: `
        <div style="width: 28px; height: 36px; transform: translate(-14px, -36px);" class="flex flex-col items-center">
          <div class="w-7 h-7 rounded-full bg-[#355858] text-white border-2 border-white shadow-md flex items-center justify-center font-mono font-bold text-xs">
            ${index + 1}
          </div>
          <div class="w-1.5 h-2 bg-[#355858] -mt-0.5"></div>
        </div>
      `,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });
  }, []);

  const getUnselectedPinIcon = useCallback((status: string) => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    const meta = getMapStatusMeta(status);
    return L.divIcon({
      className: 'route-candidate-marker',
      html: `<div style="width: 14px; height: 14px; border-radius: 9999px; background: ${meta.color}; border: 2px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }, []);

  const stopIdSet = useMemo(() => new Set(optimizedRoute.map((s) => s.id)), [optimizedRoute]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-[#F3F2EB]">
      {/* ── LEFT CONTROL PANEL ── */}
      <div className="w-full lg:w-[440px] bg-[#FFFFFF] border-r border-[#DDDCD3] flex flex-col h-full overflow-y-auto shrink-0 shadow-sm">
        <div className="p-5 border-b border-[#DDDCD3] flex items-start justify-between gap-2 bg-[#FAF9F5]">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider">
              LOGISTICS &amp; DISPATCH OPTIMIZER
            </div>
            <h2 className="text-xl font-display font-bold text-[#293732] tracking-tight">
              Field Routing Engine
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !showHistory;
              setShowHistory(next);
              if (next) void fetchHistory();
            }}
            data-testid="toggle-dispatch-history-btn"
            className="px-2.5 py-1.5 rounded-xl bg-white border border-[#DDDCD3] text-xs font-semibold text-[#355858] hover:bg-[#E9ECE6] flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          {showHistory ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#65736B]">
                  Confirmed Dispatch Plans
                </h3>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-[#527B7A] font-semibold hover:underline cursor-pointer"
                >
                  Back to Planner
                </button>
              </div>
              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-[#65736B] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading dispatch history...
                </div>
              ) : dispatchHistory.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#65736B]">
                  No confirmed dispatch routes recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {dispatchHistory.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#293732]">{r.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#537C60] border border-[#CDE3D2]">
                          {r.geomJson?.status || 'CONFIRMED'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#65736B]">
                        {r.geomJson?.personnelName || 'Field Personnel'} ·{' '}
                        {r.geomJson?.stopIssueIds?.length ?? 0} stops
                        {r.geomJson?.totalDistanceM != null
                          ? ` · ${(r.geomJson.totalDistanceM / 1000).toFixed(2)} km`
                          : ''}
                      </div>
                      <div className="text-[10px] font-mono text-[#929B92]">
                        {formatDateTimeIST(r.geomJson?.confirmedAt || r.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Personnel Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#293732] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#527B7A]" />
                  <span>Assign to Field Personnel</span>
                </label>
                <select
                  value={selectedPersonnelId}
                  onChange={(e) => setSelectedPersonnelId(e.target.value)}
                  data-testid="route-personnel-select"
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs font-medium text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A] cursor-pointer"
                >
                  {personnels.length === 0 ? (
                    <option value="">No active field personnel available</option>
                  ) : (
                    personnels.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.role} ({p.dutyStatus || 'Active'}
                        {p.workload ? ` · ${p.workload.activeCount} active` : ''})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Start Location Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#293732] flex items-center justify-between">
                  <span>Starting Location</span>
                  <button
                    type="button"
                    onClick={requestGpsStart}
                    className="text-[11px] text-[#527B7A] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>Use My GPS</span>
                  </button>
                </label>
                <select
                  value={startMode}
                  onChange={(e) => setStartMode(e.target.value as 'WARD_CENTER' | 'GPS' | 'FIRST_STOP')}
                  className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3 py-2 text-xs text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                >
                  <option value="WARD_CENTER">
                    {currentWard?.wardLabel || 'Ward'} Base ({startLocation.lat.toFixed(3)}, {startLocation.lng.toFixed(3)})
                  </option>
                  <option value="FIRST_STOP">First Highest-Priority Stop</option>
                  {gpsStart && <option value="GPS">Current GPS Location</option>}
                </select>
                {gpsError && <p className="text-[11px] text-[#B76F60]">{gpsError}</p>}
              </div>

              {/* Work Orders Filter & Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#293732]">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                    <span>Work Orders ({selectedIssueIds.length} / {filteredIssues.length} Selected)</span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedIssueIds(filteredIssues.slice(0, 5).map((i) => i.id))}
                      className="text-[#527B7A] hover:underline cursor-pointer"
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIssueIds([]);
                        setOptimizedRoute([]);
                        setRoadCoords(null);
                      }}
                      className="text-[#65736B] hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="relative col-span-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search issue ID or street..."
                      className="w-full bg-[#E9ECE6] border border-[#DDDCD3] rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] text-[#293732] focus:outline-none focus:ring-1 focus:ring-[#527B7A]"
                    />
                    <Search className="w-3 h-3 text-[#929B92] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-[#E9ECE6] border border-[#DDDCD3] rounded-lg px-2 py-1 text-[11px] text-[#293732]"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="POTHOLES">Potholes</option>
                    <option value="DRAINAGE">Drainage</option>
                    <option value="WATERLOGGING">Waterlogging</option>
                    <option value="STREETLIGHTS">Streetlights</option>
                    <option value="SIDEWALKS">Sidewalks</option>
                    <option value="TRAFFIC_SIGNS">Traffic Signs</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-[#E9ECE6] border border-[#DDDCD3] rounded-lg px-2 py-1 text-[11px] text-[#293732]"
                  >
                    <option value="ALL">All Status</option>
                    <option value="OPEN">Open</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DISPUTED">Disputed</option>
                    <option value="REOPENED_IN_WARRANTY">Reopened</option>
                  </select>
                  <select
                    value={bandFilter}
                    onChange={(e) => setBandFilter(e.target.value)}
                    className="bg-[#E9ECE6] border border-[#DDDCD3] rounded-lg px-2 py-1 text-[11px] text-[#293732]"
                  >
                    <option value="ALL">All Priority</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-[#DDDCD3] rounded-xl p-2 bg-[#FAF9F5]">
                  {filteredIssues.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#929B92]">
                      No eligible work orders match current filters.
                    </div>
                  ) : (
                    filteredIssues.map((issue) => {
                      const isChecked = selectedIssueIds.includes(issue.id);
                      return (
                        <label
                          key={issue.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                            isChecked ? 'bg-white border border-[#527B7A]/40 shadow-sm' : 'hover:bg-white/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleIssueSelection(issue.id)}
                            className="mt-0.5 rounded text-[#355858] focus:ring-[#527B7A]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[10px] font-bold text-[#355858]">
                                {formatShortId(issue.id)}
                              </span>
                              <span className="text-[10px] font-semibold text-[#65736B]">
                                {issue.band || 'MED'} · {issue.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="font-semibold text-[#293732] truncate">{issue.title}</div>
                            <div className="text-[10px] text-[#65736B] truncate">
                              {issue.assignedPersonnel ? `Assigned: ${issue.assignedPersonnel}` : 'Unassigned'}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Calculate Practical Visit Sequence */}
              <button
                type="button"
                onClick={() => void handleCalculateRoute()}
                disabled={isOptimizing || selectedIssueIds.length === 0}
                data-testid="calculate-route-btn"
                className="w-full py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(53,88,88,0.25)] transition-all cursor-pointer disabled:opacity-40"
              >
                {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                <span>Calculate Practical Visit Sequence</span>
              </button>

              {routeNotice && (
                <div className="p-2.5 rounded-xl bg-[#FDF7F0] border border-[#F2DFCA] text-[11px] text-[#8A5A2B]">
                  {routeNotice}
                </div>
              )}

              {/* Draft Optimized Route Summary & Editable Stop List */}
              {optimizedRoute.length > 0 && (
                <div className="space-y-3 p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[#293732] block">
                        Draft Visit Sequence ({optimizedRoute.length} stops)
                      </span>
                      <span className="text-[10px] text-[#65736B]">
                        {routeSource === 'TOMTOM_ROAD'
                          ? 'Road-network distance & duration (TomTom)'
                          : 'Straight-line distance (road provider fallback)'}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#355858] text-right">
                      {routeSource === 'TOMTOM_ROAD' && roadDistanceM != null
                        ? `${(roadDistanceM / 1000).toFixed(2)} km${roadDurationS != null ? ` · ~${Math.max(1, Math.round(roadDurationS / 60))} mins` : ''}`
                        : `${straightLineKm} km (straight-line)`}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {optimizedRoute.map((stop, idx) => (
                      <div
                        key={stop.id}
                        className="flex items-center justify-between gap-2 text-xs p-2 rounded-xl bg-white border border-[#E5E9E3]"
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-full bg-[#355858] text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[#293732] truncate">
                              {formatShortId(stop.id)} · {stop.category.replace(/_/g, ' ')}
                            </div>
                            <div className="text-[10px] text-[#65736B] truncate">
                              {stop.address || `${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0 || isOptimizing}
                            onClick={() => void moveStop(idx, -1)}
                            title="Move stop up"
                            className="p-1 rounded hover:bg-[#E9ECE6] text-[#65736B] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === optimizedRoute.length - 1 || isOptimizing}
                            onClick={() => void moveStop(idx, 1)}
                            title="Move stop down"
                            className="p-1 rounded hover:bg-[#E9ECE6] text-[#65736B] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={isOptimizing}
                            onClick={() => void removeStop(stop.id)}
                            title="Remove stop"
                            className="p-1 rounded hover:bg-[#FBF1EF] text-[#B76F60] cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Open Confirm Dispatch Summary */}
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={isDispatching || !activePersonnel}
                    data-testid="open-confirm-dispatch-btn"
                    className="w-full py-2.5 px-3 rounded-xl bg-[#537C60] hover:bg-[#43644E] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm Dispatch to {activePersonnel?.name || 'Personnel'}</span>
                  </button>
                </div>
              )}

              {dispatchError && (
                <div className="p-3.5 rounded-xl bg-[#FCEBE6] border border-[#F5C7BD] text-xs text-[#B76F60] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{dispatchError}</span>
                </div>
              )}

              {dispatchSuccess && (
                <div className="p-3.5 rounded-xl bg-[#EBF3ED] border border-[#CDE3D2] text-xs text-[#537C60] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{dispatchSuccess}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT MAP VIEW ── */}
      <div className="flex-1 relative w-full h-full min-h-[480px] bg-[#E9ECE6]">
        <CartoConfigNotice />
        <MapContainer
          center={mapCenter}
          zoom={14}
          scrollWheelZoom={true}
          className="w-full h-full z-10"
        >
          <CartoTileLayer style="voyager" />
          <WardViewportSync />

          {/* Road-network or fallback sequence polyline */}
          {polylinePositions.length > 1 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#355858',
                weight: 4,
                opacity: 0.9,
                dashArray: routeSource === 'TOMTOM_ROAD' ? undefined : '6 8',
              }}
            />
          )}

          {/* Unselected candidate work order pins */}
          {filteredIssues
            .filter((i) => !stopIdSet.has(i.id))
            .map((issue) => (
              <Marker
                key={`cand-${issue.id}`}
                position={[issue.latitude, issue.longitude]}
                icon={getUnselectedPinIcon(issue.status)}
              >
                <Popup>
                  <div className="p-2 space-y-1 font-body text-xs">
                    <div className="font-mono font-bold text-[#355858]">
                      {formatShortId(issue.id)} · {issue.status.replace(/_/g, ' ')}
                    </div>
                    <div className="font-semibold text-[#293732]">{issue.title}</div>
                    <div className="text-[11px] text-[#65736B]">{issue.address}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* Ordered Route Stop Markers */}
          {optimizedRoute.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={getStopPinIcon(idx)}
            >
              <Popup>
                <div className="p-2 space-y-1 font-body text-xs">
                  <div className="font-mono font-bold text-[#355858]">
                    Stop #{idx + 1} · {formatShortId(stop.id)}
                  </div>
                  <div className="font-semibold text-[#293732]">{stop.title}</div>
                  <div className="text-[11px] text-[#65736B]">{stop.address}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Floating Cartography Badge */}
        <div className="absolute top-4 right-4 z-20 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#DDDCD3] shadow-md text-xs font-mono text-[#355858]">
            Routing Sequence: {optimizedRoute.length} Waypoints
          </div>
        </div>
      </div>

      {/* ── CONFIRM DISPATCH SUMMARY MODAL ── */}
      {showConfirmModal && activePersonnel && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#DDDCD3] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#DDDCD3] pb-3">
              <h3 className="font-display font-bold text-lg text-[#293732]">
                Confirm Field Dispatch
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-7 h-7 rounded-lg bg-[#E9ECE6] hover:bg-[#DDDCD3] text-[#65736B] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#65736B]">Assigned Employee:</span>
                  <span className="font-semibold text-[#293732]">
                    {activePersonnel.name} ({activePersonnel.role})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#65736B]">Starting Location:</span>
                  <span className="font-medium text-[#293732]">{startLocation.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#65736B]">Total Stops:</span>
                  <span className="font-mono font-bold text-[#355858]">{optimizedRoute.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#65736B]">Distance:</span>
                  <span className="font-mono text-[#293732]">
                    {routeSource === 'TOMTOM_ROAD' && roadDistanceM != null
                      ? `${(roadDistanceM / 1000).toFixed(2)} km (Road)`
                      : `${straightLineKm} km (Straight-line)`}
                  </span>
                </div>
                {slaBreachedStops > 0 && (
                  <div className="text-[#B76F60] font-semibold pt-1">
                    Warning: {slaBreachedStops} stop(s) have breached SLA deadlines.
                  </div>
                )}
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 border border-[#E5E9E3] rounded-xl p-2 bg-[#FAF9F5]">
                {optimizedRoute.map((s, idx) => (
                  <div key={s.id} className="text-[11px] flex items-center gap-2">
                    <span className="font-mono font-bold text-[#355858]">#{idx + 1}</span>
                    <span className="font-mono">{formatShortId(s.id)}</span>
                    <span className="truncate text-[#65736B]">{s.address || s.category}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#DDDCD3]">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-[#DDDCD3] text-[#65736B] hover:bg-[#E9ECE6] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDispatching}
                onClick={() => void handleConfirmDispatch()}
                data-testid="confirm-dispatch-submit-btn"
                className="px-4 py-2 rounded-xl bg-[#537C60] hover:bg-[#43644E] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDispatching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm &amp; Dispatch</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
