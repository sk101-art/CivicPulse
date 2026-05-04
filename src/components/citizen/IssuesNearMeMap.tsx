'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

type NearbyReport = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  status: string;
  category: string;
  priorityScore?: number | null;
  createdAt?: string | Date;
};

type PlacementMode = 'source' | 'destination' | 'report' | null;

function sourceIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(16,185,129,0.5);
        box-shadow:0 0 22px rgba(16,185,129,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">S</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function destIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(255,46,99,0.5);
        box-shadow:0 0 22px rgba(255,46,99,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">D</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function clusterIcon(count: number) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:34px;height:34px;border-radius:9999px;
        background:rgba(0,212,255,0.16);
        border:1px solid rgba(0,212,255,0.35);
        box-shadow:0 0 26px rgba(0,212,255,0.18);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:12px;
      ">${count}</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToPolyDist(pt: [number, number], poly: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i], B = poly[i + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - A[0]) * dx + (pt[1] - A[1]) * dy) / lenSq));
    const d = haversineMeters(pt[0], pt[1], A[0] + t * dx, A[1] + t * dy);
    if (d < min) min = d;
  }
  return min;
}

const HAZARD_RADIUS = 150;

interface RouteOption {
  coords: [number, number][];
  distance: number;
  duration: number;
  hazards: number;
  status: 'safe' | 'rerouted' | 'warn';
  isDetour?: boolean;
}

async function fetchAllRoutes(waypoints: [number, number][], alternatives: number | false = 3) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const altParam = alternatives === false ? 'false' : alternatives.toString();
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${altParam}`;
  const res = await fetch(url);
  const data: unknown = await res.json();
  const parsed = data as { code?: string; routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; distance?: number; duration?: number; }> };
  if (parsed.code !== 'Ok' || !parsed.routes?.length) return [];
  return parsed.routes.map(r => {
    const coords = r.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (!coords?.length || typeof r.distance !== 'number' || typeof r.duration !== 'number') return null;
    return { coords, distance: r.distance, duration: r.duration };
  }).filter((x): x is { coords: [number, number][]; distance: number; duration: number } => Boolean(x));
}

function buildDetourWaypoints(
  src: [number, number],
  dst: [number, number],
  routeCoords: [number, number][],
  hazards: { lat: number; lng: number }[]
): [number, number][] {
  const positioned = hazards.map(h => {
    let bestIdx = 0, bestDist = Infinity;
    routeCoords.forEach((c, i) => {
      const d = haversineMeters(h.lat, h.lng, c[0], c[1]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    return { ...h, idx: bestIdx };
  }).sort((a, b) => a.idx - b.idx);

  const waypoints: [number, number][] = [src];
  for (const hz of positioned) {
    const idx = hz.idx;
    const before = routeCoords[Math.max(0, idx - 10)];
    const after = routeCoords[Math.min(routeCoords.length - 1, idx + 10)];
    const dLat = after[0] - before[0];
    const dLng = after[1] - before[1];
    const len = Math.sqrt(dLat * dLat + dLng * dLng);
    if (len === 0) continue;

    const perpLat = -dLng / len;
    const perpLng = dLat / len;
    const offsetDeg = 500 / 111000; 

    const optA: [number, number] = [hz.lat + perpLat * offsetDeg, hz.lng + perpLng * offsetDeg];
    const optB: [number, number] = [hz.lat - perpLat * offsetDeg, hz.lng - perpLng * offsetDeg];
    const dA = haversineMeters(optA[0], optA[1], hz.lat, hz.lng);
    const dB = haversineMeters(optB[0], optB[1], hz.lat, hz.lng);
    waypoints.push(dA >= dB ? optA : optB);
  }
  waypoints.push(dst);
  return waypoints;
}

function fmt(m: number) { return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function fmtTime(s: number) { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; }

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoomend(e) { onZoom(e.target.getZoom()); } });
  return null;
}

function MapClickHandler({ mode, onPlace }: { mode: PlacementMode; onPlace: (latlng: L.LatLng) => void }) {
  useMapEvents({ click(e) { if (mode) onPlace(e.latlng); } });
  return null;
}

function CustomZoomControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2">
      <button onClick={(e) => { e.stopPropagation(); map.zoomIn(); }} className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg">+</button>
      <button onClick={(e) => { e.stopPropagation(); map.zoomOut(); }} className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg">-</button>
    </div>
  );
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

export function IssuesNearMeMap({ showReportButton, onReportLocation }: { showReportButton?: boolean; onReportLocation?: (lat: number, lng: number) => void }) {
  const [reports, setReports] = useState<NearbyReport[]>([]);
  const [filtered, setFiltered] = useState<NearbyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState('');
  const [radius] = useState(500);
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.9716, 77.5946]);
  const [zoom, setZoom] = useState(16);

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [mode, setMode] = useState<PlacementMode>(null);
  const [source, setSource] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [hazards, setHazards] = useState<NearbyReport[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setPulse((p) => (p + 1) % 120), 80);
    return () => window.clearInterval(t);
  }, []);

  const categoryOptions = useMemo(() => ['ALL', ...Array.from(new Set(reports.map(r => r.category))).sort()], [reports]);
  const statusOptions = useMemo(() => ['ALL', ...Array.from(new Set(reports.map(r => r.status))).sort()], [reports]);

  const catColor = useCallback((category: string) => {
    const m: Record<string, string> = {
      POTHOLES: 'var(--cat-potholes)', DRAINAGE: 'var(--cat-drainage)', STREETLIGHTS: 'var(--cat-streetlights)',
      SIDEWALKS: 'var(--cat-sidewalks)', TRAFFIC_SIGNS: 'var(--cat-traffic_signs)', GRAFFITI: 'var(--cat-graffiti)',
      TRASH: 'var(--cat-trash)', OTHER: 'var(--cat-other)'
    };
    return m[category] || 'var(--cat-other)';
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        setMapCenter(coords);
        setGeoError('');
      },
      (err) => { setGeoError('Location access denied. Showing default area.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    async function fetchReports() {
      setLoading(true);
      try {
        const res = await fetch('/api/reports');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setReports(data.reports || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  useEffect(() => {
    if (!userPos) { setFiltered(reports); return; }
    const withinRadius = reports.filter(r => haversineMeters(userPos[0], userPos[1], r.latitude, r.longitude) <= radius);
    let f = withinRadius;
    if (categoryFilter !== 'ALL') f = f.filter(r => r.category === categoryFilter);
    if (statusFilter !== 'ALL') f = f.filter(r => r.status === statusFilter);
    setFiltered(f);
  }, [reports, userPos, radius, categoryFilter, statusFilter]);

  const renderPoints = useMemo(() => {
    if (zoom >= 17) return filtered.map(r => ({ type: 'single' as const, lat: r.latitude, lng: r.longitude, reports: [r] }));
    const clusters: { type: 'cluster'; lat: number; lng: number; reports: NearbyReport[] }[] = [];
    const threshold = zoom < 15 ? 100 : 40;
    const used = new Set<string>();
    for (const r of filtered) {
      if (used.has(r.id)) continue;
      const cluster = [r];
      used.add(r.id);
      for (const other of filtered) {
        if (!used.has(other.id) && haversineMeters(r.latitude, r.longitude, other.latitude, other.longitude) < threshold) {
          cluster.push(other);
          used.add(other.id);
        }
      }
      if (cluster.length > 1) {
        const avgLat = cluster.reduce((sum, item) => sum + item.latitude, 0) / cluster.length;
        const avgLng = cluster.reduce((sum, item) => sum + item.longitude, 0) / cluster.length;
        clusters.push({ type: 'cluster', lat: avgLat, lng: avgLng, reports: cluster });
      } else {
        clusters.push({ type: 'cluster', lat: r.latitude, lng: r.longitude, reports: [r] });
      }
    }
    return clusters;
  }, [filtered, zoom]);

  useEffect(() => {
    if (allRoutes.length > 0 && allRoutes[selectedRouteIndex]) {
      const openIssues = reports.filter(r => r.status !== 'RESOLVED');
      const onRoute = openIssues.filter(issue => pointToPolyDist([issue.latitude, issue.longitude], allRoutes[selectedRouteIndex].coords) < HAZARD_RADIUS);
      setHazards(onRoute);
    } else {
      setHazards([]);
    }
  }, [selectedRouteIndex, allRoutes, reports]);

  const clearRoutes = useCallback(() => {
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setHazards([]);
  }, []);

  const clearAll = useCallback(() => {
    setSource(null);
    setDestination(null);
    setMode(null);
    clearRoutes();
  }, [clearRoutes]);

  const handlePlace = useCallback((latlng: L.LatLng) => {
    if (mode === 'source') { setSource([latlng.lat, latlng.lng]); clearRoutes(); }
    else if (mode === 'destination') { setDestination([latlng.lat, latlng.lng]); clearRoutes(); }
    else if (mode === 'report' && onReportLocation) { onReportLocation(latlng.lat, latlng.lng); }
    setMode(null);
  }, [mode, onReportLocation, clearRoutes]);

  const optimize = useCallback(async () => {
    if (!source || !destination) return;
    setRouteLoading(true);
    clearRoutes();

    try {
      const openIssues = reports.filter(r => r.status !== 'RESOLVED');
      const getHazards = (coords: [number, number][]) => 
        openIssues.filter(issue => pointToPolyDist([issue.latitude, issue.longitude], coords) < HAZARD_RADIUS);

      const routes = await fetchAllRoutes([source, destination], 3);
      if (!routes.length) { alert('No route found between those points.'); return; }

      const processedRoutes: RouteOption[] = [];

      for (const r of routes) {
        const routeHazards = getHazards(r.coords);
        if (routeHazards.length === 0) {
          processedRoutes.push({ coords: r.coords, distance: r.distance, duration: r.duration, hazards: 0, status: 'safe' });
        } else {
          const hazardPts = routeHazards.map(h => ({ lat: h.latitude, lng: h.longitude }));
          const detourWps = buildDetourWaypoints(source, destination, r.coords, hazardPts);
          const rerouted = await fetchAllRoutes(detourWps, false);
          
          if (rerouted.length > 0) {
            const detourHazards = getHazards(rerouted[0].coords);
            if (detourHazards.length === 0) {
              processedRoutes.push({ coords: rerouted[0].coords, distance: rerouted[0].distance, duration: rerouted[0].duration, hazards: routeHazards.length, status: 'rerouted', isDetour: true });
            } else {
              processedRoutes.push({ coords: r.coords, distance: r.distance, duration: r.duration, hazards: routeHazards.length, status: 'warn' });
            }
          } else {
            processedRoutes.push({ coords: r.coords, distance: r.distance, duration: r.duration, hazards: routeHazards.length, status: 'warn' });
          }
        }
      }

      processedRoutes.sort((a, b) => a.distance - b.distance);
      setAllRoutes(processedRoutes);
      setSelectedRouteIndex(0);
      setHazards(getHazards(processedRoutes[0].coords));
    } catch (e) {
      console.error('Route optimization failed:', e);
    } finally {
      setRouteLoading(false);
    }
  }, [source, destination, reports, clearRoutes]);

  const nowMs = Date.now();
  const pulseFactor = 0.85 + 0.15 * Math.sin(pulse / 6);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap items-center gap-4">
        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('source')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'source' ? 'bg-emerald-500 border-emerald-400 text-black animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : source ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-emerald-500/50'
            }`}>{mode === 'source' ? '⊕ Placing Source...' : source ? '✓ Source Set' : '⊕ Set Source'}</button>
        </div>

        <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
          <button onClick={() => setMode('destination')}
            className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
              mode === 'destination' ? 'bg-magenta-500 border-magenta-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,46,99,0.4)]'
              : destination ? 'bg-magenta-500/20 border-magenta-500/30 text-magenta-400'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white/50 hover:border-magenta-500/50'
            }`} style={mode === 'destination' ? { background: 'var(--accent-magenta)', borderColor: 'var(--accent-magenta)' } : {}}>{mode === 'destination' ? '⊕ Placing Dest...' : destination ? '✓ Dest Set' : '⊕ Set Destination'}</button>
        </div>

        {source && destination && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={optimize} disabled={routeLoading}
              className="px-5 py-2 rounded-xl text-[10px] font-display font-black uppercase tracking-widest bg-cyan-500 text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-cyan-400 active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent-cyan)' }}>
              {routeLoading ? '⏳ Computing Path...' : '▶ Compute Safe Route'}
            </button>
          </div>
        )}

        {showReportButton && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={() => setMode('report')}
              className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border transition-all ${
                mode === 'report' ? 'bg-amber-500 border-amber-400 text-black animate-pulse shadow-[0_0_20px_rgba(255,184,0,0.4)]'
                : 'bg-black/60 backdrop-blur-md border-white/10 text-amber-400 hover:border-amber-500/50'
              }`}>{mode === 'report' ? '📍 Pinning Issue...' : '📍 Report on Map'}</button>
          </div>
        )}

        {(source || destination) && (
          <div className="p-3 bg-gray-950 rounded-xl shadow-lg border border-white/5 flex items-center justify-center">
            <button onClick={clearAll}
              className="px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest bg-black/60 backdrop-blur-md border border-white/10 text-white/40 hover:text-magenta-400 hover:border-magenta-500/30">
              ✕ Reset
            </button>
          </div>
        )}
      </div>

      {allRoutes.length > 0 && (
        <div className="absolute top-24 left-4 z-[1000] flex gap-2 overflow-x-auto max-w-[80vw]">
          {allRoutes.map((route, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRouteIndex(idx)}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all shadow-lg backdrop-blur-md whitespace-nowrap ${
                selectedRouteIndex === idx
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-black/60 border-white/10 text-white/50 hover:border-white/30'
              }`}
            >
              <div className="text-[10px] font-mono font-black uppercase tracking-widest flex items-center gap-2">
                Route {idx + 1} {selectedRouteIndex === idx && '✓'}
              </div>
              <div className="text-xs font-bold">
                {fmt(route.distance)} • {fmtTime(route.duration)}
              </div>
              <div className="text-[9px] font-mono uppercase">
                {route.status === 'safe' && 'Optimal Path Clear'}
                {route.status === 'rerouted' && `Avoided ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''}`}
                {route.status === 'warn' && `⚠ ${route.hazards} Hazard${route.hazards > 1 ? 's' : ''} on path`}
              </div>
            </button>
          ))}
        </div>
      )}

      {mode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/10 text-sm font-bold text-white shadow-2xl">
          {mode === 'source' && 'Click on the map to place your 🟢 Source point'}
          {mode === 'destination' && 'Click on the map to place your 🔴 Destination point'}
          {mode === 'report' && 'Click on the map to place a 📍 new issue at that location'}
        </div>
      )}

      {routeLoading && (
        <div className="absolute inset-0 z-[999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-slate-900 border border-indigo-500/20 text-sm font-bold text-indigo-400 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Computing safe route via OSRM...
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 w-[220px]">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-xl px-3 text-xs font-mono uppercase tracking-widest outline-none"
          style={{ background: 'rgba(10,10,11,0.65)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' }}
        >
          {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl px-3 text-xs font-mono uppercase tracking-widest outline-none"
          style={{ background: 'rgba(10,10,11,0.65)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' }}
        >
          {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <div className="rounded-xl px-3 py-2 text-[10px] font-mono uppercase tracking-widest" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.18)', color: 'var(--accent-electric-blue)' }}>
          {loading ? 'Scanning…' : `${filtered.length} within 500m`}
        </div>
        {geoError && (
          <div className="rounded-xl px-3 py-2 text-[10px] font-mono uppercase tracking-widest" style={{ background: 'rgba(255,46,99,0.10)', border: '1px solid rgba(255,46,99,0.22)', color: 'var(--accent-magenta)' }}>
            {geoError}
          </div>
        )}
      </div>

      <MapContainer center={mapCenter} zoom={16} className="w-full h-full" scrollWheelZoom zoomControl={false} style={{ background: 'var(--bg-primary)' }}>
        <CustomZoomControls />
        <ZoomTracker onZoom={setZoom} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />
        <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {userPos && (
          <>
            <Circle center={userPos} radius={radius} pathOptions={{ color: 'var(--accent-electric-blue)', weight: 1, opacity: 0.6, fillColor: 'var(--accent-electric-blue)', fillOpacity: 0.05 }} />
            <CircleMarker center={userPos} radius={7} pathOptions={{ color: 'transparent', fillColor: 'var(--accent-cyan)', fillOpacity: 0.95 }}><Popup><b>You are here</b></Popup></CircleMarker>
          </>
        )}

        {allRoutes.map((route, idx) => (
          <Polyline
            key={`route-${idx}`}
            positions={route.coords}
            eventHandlers={{ click: () => setSelectedRouteIndex(idx) }}
            pathOptions={{
              color: idx === selectedRouteIndex ? 'var(--accent-cyan)' :
                     idx === 1 ? 'var(--accent-magenta)' : 'var(--text-muted)',
              weight: idx === selectedRouteIndex ? 5 : 3,
              opacity: idx === selectedRouteIndex ? 1 : 0.5,
              dashArray: idx === selectedRouteIndex ? undefined : '8, 12',
            }}
          />
        ))}

        {hazards.flatMap((h) => [
          <Circle key={`hz-pulse-${h.id}`} center={[h.latitude, h.longitude]} radius={HAZARD_RADIUS * (1 + 0.18 * pulseFactor)} pathOptions={{ fillColor: 'var(--accent-magenta)', fillOpacity: 0.06, color: 'var(--accent-magenta)', weight: 1, dashArray: '4, 10', opacity: 0.55 }} />,
          <Circle key={`hz-${h.id}`} center={[h.latitude, h.longitude]} radius={HAZARD_RADIUS} pathOptions={{ fillColor: 'var(--accent-magenta)', fillOpacity: 0.12, color: 'var(--accent-magenta)', weight: 2, opacity: 0.85 }} />
        ])}

        {source && (
          <Marker position={source} icon={sourceIcon()}><Popup><b>Source</b></Popup></Marker>
        )}
        {destination && (
          <Marker position={destination} icon={destIcon()}><Popup><b>Destination</b></Popup></Marker>
        )}

        {renderPoints.map((item) => {
          if (item.type === 'cluster') {
             return (<Marker key={`cl-${item.lat.toFixed(6)}-${item.lng.toFixed(6)}-${item.reports.length}`} position={[item.lat, item.lng]} icon={clusterIcon(item.reports.length)}><Popup><b>{item.reports.length} issues</b></Popup></Marker>);
          }
          const r = item.reports[0];
          const isHz = hazards.some(h => h.id === r.id);
          const color = r.status === 'RESOLVED' ? 'var(--accent-lime)' : catColor(r.category);
          const pr = r.priorityScore == null ? 0.5 : Number(r.priorityScore);
          const radiusPx = 6 + clamp(pr, 0, 1) * 8;
          const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : null;
          const isNew = createdAt != null && nowMs - createdAt < 60 * 60 * 1000;
          return (
            <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={radiusPx * (isNew ? (1 + 0.12 * pulseFactor) : 1)} pathOptions={{ color: 'transparent', fillColor: isHz ? 'var(--accent-magenta)' : color, fillOpacity: isHz ? 0.85 : (isNew ? 0.55 + 0.25 * pulseFactor : 0.72) }}>
              <Popup>
                <div className="min-w-[160px]">
                  <b className="text-sm">{r.title}</b>
                  <p className="text-xs text-slate-500 uppercase">{r.category}</p>
                  <p className="text-xs text-slate-500 uppercase">{r.status}</p>
                  {isHz && <p className="text-xs font-bold mt-1" style={{ color: 'var(--accent-magenta)' }}>⚠ Hazard zone</p>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
