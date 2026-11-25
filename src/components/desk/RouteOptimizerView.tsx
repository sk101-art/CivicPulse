'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  Navigation, Users, MapPin, CheckCircle2, 
  Clock, AlertTriangle, ArrowRight, Play,
  Send, RefreshCw, Loader2, Sparkles, SlidersHorizontal
} from 'lucide-react';
import { useGeoContext } from '@/context/GeoContext';
import { CartoTileLayer, CartoConfigNotice } from '@/components/map/CartoTileLayer';

// Dynamic Leaflet map container to avoid SSR window issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
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
}

interface IssueItem {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  priorityScore: number;
  status: string;
  address?: string;
}

interface RouteOptimizerViewProps {
  initialReports: IssueItem[];
}

// Haversine distance in kilometers
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function RouteOptimizerView({ initialReports }: RouteOptimizerViewProps) {
  const { currentWard } = useGeoContext();

  const [personnels, setPersonnels] = useState<Personnel[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('');
  const [issues, setIssues] = useState<IssueItem[]>(initialReports);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<IssueItem[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  // Load field personnels from /api/personnels
  useEffect(() => {
    let cancelled = false;
    const fetchPersonnel = async () => {
      try {
        const res = await fetch('/api/personnels');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setPersonnels(data);
            setSelectedPersonnelId(data[0].id);
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to load personnels from api:', err);
      }

      // Fallback roster
      if (!cancelled) {
        const fallback = [
          { id: 'p-1', name: 'Ravi Kumar', role: 'Senior Field Engineer', contact: '+91 98765 43021', active: true, dutyStatus: 'On Duty' },
          { id: 'p-2', name: 'Meera Nair', role: 'Road Works Supervisor', contact: '+91 98456 76120', active: true, dutyStatus: 'Active' },
          { id: 'p-3', name: 'Arjun Patel', role: 'Drainage Technician', contact: '+91 99879 22109', active: true, dutyStatus: 'On Duty' },
        ];
        setPersonnels(fallback);
        setSelectedPersonnelId(fallback[0].id);
      }
    };

    fetchPersonnel();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update issues when initialReports changes and select top 5 by default
  useEffect(() => {
    setIssues(initialReports);
    const validCoords = initialReports.filter(i => i.latitude && i.longitude);
    setSelectedIssueIds(validCoords.slice(0, 5).map(i => i.id));
    setOptimizedRoute([]);
    setDispatchSuccess(null);
  }, [initialReports]);

  // Selected personnel object
  const activePersonnel = useMemo(() => {
    return personnels.find(p => p.id === selectedPersonnelId) || personnels[0];
  }, [personnels, selectedPersonnelId]);

  // Toggle issue selection
  const toggleIssueSelection = (id: string) => {
    setSelectedIssueIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
    setOptimizedRoute([]);
    setDispatchSuccess(null);
  };

  // Calculate practical visit sequence via nearest-neighbor TSP
  const handleCalculateRoute = () => {
    const selected = issues.filter(i => selectedIssueIds.includes(i.id) && i.latitude && i.longitude);
    if (selected.length === 0) return;

    setIsOptimizing(true);
    setDispatchSuccess(null);

    // Greedy nearest neighbor sequence starting from highest priority item
    const unvisited = [...selected].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    const sequence: IssueItem[] = [];

    let current = unvisited.shift()!;
    sequence.push(current);

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = haversineKm(current.latitude, current.longitude, unvisited[i].latitude, unvisited[i].longitude);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      current = unvisited.splice(nearestIdx, 1)[0];
      sequence.push(current);
    }

    setOptimizedRoute(sequence);
    setIsOptimizing(false);
  };

  // Route statistics
  const routeStats = useMemo(() => {
    if (optimizedRoute.length < 2) {
      return { totalKm: 0, estimatedMinutes: 0 };
    }
    let totalKm = 0;
    for (let i = 0; i < optimizedRoute.length - 1; i++) {
      totalKm += haversineKm(
        optimizedRoute[i].latitude,
        optimizedRoute[i].longitude,
        optimizedRoute[i + 1].latitude,
        optimizedRoute[i + 1].longitude
      );
    }
    // Urban driving estimate: ~25 km/h + 15 min per defect inspection
    const travelTimeMin = Math.round((totalKm / 25) * 60);
    const inspectionTimeMin = optimizedRoute.length * 15;
    return {
      totalKm: Number(totalKm.toFixed(2)),
      estimatedMinutes: travelTimeMin + inspectionTimeMin,
    };
  }, [optimizedRoute]);

  // Route Polyline coordinates
  const polylinePositions = useMemo(() => {
    return optimizedRoute.map(item => [item.latitude, item.longitude] as [number, number]);
  }, [optimizedRoute]);

  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Confirm & Dispatch Action
  const handleDispatch = async () => {
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
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to dispatch route');
      }

      setDispatchSuccess(
        `Dispatched ${data.dispatchedCount ?? optimizedRoute.length} work items to ${activePersonnel.name} (${routeStats.totalKm} km itinerary).`
      );
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

  const getPinIcon = useCallback((index: number, category: string) => {
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

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-[#F3F2EB]">
      {/* ── LEFT CONTROL PANEL ── */}
      <div className="w-full lg:w-[420px] bg-[#FFFFFF] border-r border-[#DDDCD3] flex flex-col h-full overflow-y-auto shrink-0 shadow-sm">
        {/* Header Section */}
        <div className="p-5 border-b border-[#DDDCD3] space-y-2 bg-[#FAF9F5]">
          <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider">
            LOGISTICS & DISPATCH OPTIMIZER
          </div>
          <h2 className="text-xl font-display font-bold text-[#293732] tracking-tight">
            Field Routing Engine
          </h2>
          <p className="text-xs text-[#65736B]">
            Sequence work orders by geographic proximity to minimize crew travel latency and ensure timely SLA fulfillment.
          </p>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Personnel Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#293732] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#527B7A]" />
              <span>Assign to Field Personnel</span>
            </label>
            <div className="relative">
              <select
                value={selectedPersonnelId}
                onChange={(e) => setSelectedPersonnelId(e.target.value)}
                className="w-full appearance-none bg-[#E9ECE6] border border-[#DDDCD3] rounded-xl px-3.5 py-2.5 pr-8 text-xs font-medium text-[#293732] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-[#527B7A] cursor-pointer"
              >
                {personnels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.role} ({p.dutyStatus || 'Active'})
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#65736B] text-[10px]">▼</span>
            </div>
            {activePersonnel && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] text-xs text-[#65736B]">
                <span>Contact: {activePersonnel.contact}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#537C60] border border-[#CDE3D2]">
                  {activePersonnel.dutyStatus || 'On Duty'}
                </span>
              </div>
            )}
          </div>

          {/* Issue Selection List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#293732]">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#527B7A]" />
                <span>Work Orders ({selectedIssueIds.length} Selected)</span>
              </span>
              <span className="text-[11px] font-mono text-[#527B7A]">
                {currentWard?.wardLabel || 'Ward'} Grid
              </span>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 border border-[#DDDCD3] rounded-xl p-2 bg-[#FAF9F5]">
              {issues.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#929B92]">
                  No active work orders with coordinates in this scope.
                </div>
              ) : (
                issues.map((issue) => {
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
                        <div className="font-semibold text-[#293732] truncate">{issue.title}</div>
                        <div className="text-[11px] text-[#65736B] truncate font-mono">
                          {issue.latitude.toFixed(3)}, {issue.longitude.toFixed(3)}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Action Button: Optimize Sequence */}
          <button
            type="button"
            onClick={handleCalculateRoute}
            disabled={isOptimizing || selectedIssueIds.length === 0}
            className="w-full py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#293732] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(53,88,88,0.25)] transition-all cursor-pointer disabled:opacity-40"
          >
            {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            <span>Calculate Practical Visit Sequence</span>
          </button>

          {/* Optimized Route Sequence Card */}
          {optimizedRoute.length > 0 && (
            <div className="space-y-3 p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDDCD3] shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#293732]">Optimized Itinerary</span>
                <span className="text-xs font-mono font-bold text-[#355858]">
                  {routeStats.totalKm} km • ~{routeStats.estimatedMinutes} mins
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {optimizedRoute.map((stop, idx) => (
                  <div key={stop.id} className="flex items-start gap-2.5 text-xs p-2 rounded-xl bg-white border border-[#E5E9E3]">
                    <span className="w-5 h-5 rounded-full bg-[#355858] text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#293732] truncate">{stop.title}</div>
                      <div className="text-[11px] text-[#65736B] truncate">
                        {stop.address || `Stop ${idx + 1} in route sequence`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Confirm Dispatch Button */}
              <button
                type="button"
                onClick={handleDispatch}
                disabled={isDispatching}
                className="w-full py-2 px-3 rounded-xl bg-[#537C60] hover:bg-[#43644E] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Assign & Dispatch to {activePersonnel?.name || 'Personnel'}</span>
              </button>
            </div>
          )}

          {/* Error Banner */}
          {dispatchError && (
            <div className="p-3.5 rounded-xl bg-[#FCEBE6] border border-[#F5C7BD] text-xs text-[#B76F60] flex items-center gap-2 shadow-sm animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{dispatchError}</span>
            </div>
          )}

          {/* Success Banner */}
          {dispatchSuccess && (
            <div className="p-3.5 rounded-xl bg-[#EBF3ED] border border-[#CDE3D2] text-xs text-[#537C60] flex items-center gap-2 shadow-sm animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{dispatchSuccess}</span>
            </div>
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

          {/* Route Polyline connecting sequenced stops */}
          {polylinePositions.length > 1 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#355858',
                weight: 4,
                opacity: 0.85,
                dashArray: '6 8',
              }}
            />
          )}

          {/* Stop Markers */}
          {optimizedRoute.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={getPinIcon(idx, stop.category)}
            >
              <Popup>
                <div className="p-2 space-y-1 font-body text-xs">
                  <div className="font-mono font-bold text-[#355858]">Stop #{idx + 1}</div>
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
    </div>
  );
}
