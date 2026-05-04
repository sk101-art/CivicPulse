'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

interface ReportPoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  status: string;
  category: string;
  priorityScore?: number;
}

type PlacementMode = 'source' | 'destination' | 'report' | null;

function MapSync({ reports }: { reports: ReportPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (reports.length > 0) {
      const bounds = L.latLngBounds(reports.map(r => [r.latitude, r.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [reports, map]);
  return null;
}

function MapClickHandler({ mode, onPlace }: { mode: PlacementMode; onPlace: (latlng: L.LatLng) => void }) {
  useMapEvents({ click(e) { if (mode) onPlace(e.latlng); } });
  return null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
    const d = haversine(pt[0], pt[1], A[0] + t * dx, A[1] + t * dy);
    if (d < min) min = d;
  }
  return min;
}

const HAZARD_RADIUS = 150; // meters

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
      const d = haversine(h.lat, h.lng, c[0], c[1]);
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
    const dA = haversine(optA[0], optA[1], hz.lat, hz.lng);
    const dB = haversine(optB[0], optB[1], hz.lat, hz.lng);
    waypoints.push(dA >= dB ? optA : optB);
  }

  waypoints.push(dst);
  return waypoints;
}

function fmt(m: number) { return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function fmtTime(s: number) { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; }

function CustomZoomControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2">
      <button onClick={(e) => { e.stopPropagation(); map.zoomIn(); }} className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg">+</button>
      <button onClick={(e) => { e.stopPropagation(); map.zoomOut(); }} className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg">-</button>
    </div>
  );
}

interface Props {
  reports: ReportPoint[];
  showReportButton?: boolean;     // true for authority
  onReportLocation?: (lat: number, lng: number) => void;
}

export default function CivicMap({ reports, showReportButton = false, onReportLocation }: Props) {
  const [mode, setMode] = useState<PlacementMode>(null);
  const [source, setSource] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);

  const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [hazards, setHazards] = useState<ReportPoint[]>([]);
  const [pulse, setPulse] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setPulse((p) => (p + 1) % 120), 80);
    return () => window.clearInterval(t);
  }, []);

  const catColor = useMemo(() => {
    const map: Record<string, string> = {
      POTHOLES: 'var(--cat-potholes)',
      DRAINAGE: 'var(--cat-drainage)',
      STREETLIGHTS: 'var(--cat-streetlights)',
      SIDEWALKS: 'var(--cat-sidewalks)',
      TRAFFIC_SIGNS: 'var(--cat-traffic_signs)',
      GRAFFITI: 'var(--cat-graffiti)',
      TRASH: 'var(--cat-trash)',
      OTHER: 'var(--cat-other)',
    };
    return (category: string) => map[category] ?? 'var(--cat-other)';
  }, []);

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
    setLoading(true);
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
      setLoading(false);
    }
  }, [source, destination, reports, clearRoutes]);

  const center: [number, number] = reports.length > 0
    ? [reports[0].latitude, reports[0].longitude]
    : [12.9716, 77.5946];

  const pulseFactor = 0.85 + 0.15 * Math.sin(pulse / 6);

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden border border-white/10 relative">
      <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap items-center gap-4">
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
            <button onClick={optimize} disabled={loading}
              className="px-5 py-2 rounded-xl text-[10px] font-display font-black uppercase tracking-widest bg-cyan-500 text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:bg-cyan-400 active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent-cyan)' }}>
              {loading ? '⏳ Computing Path...' : '▶ Compute Safe Route'}
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

      {loading && (
        <div className="absolute inset-0 z-[999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-slate-900 border border-indigo-500/20 text-sm font-bold text-indigo-400 shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Computing safe route via OSRM...
          </div>
        </div>
      )}

      <MapContainer center={center} zoom={13} scrollWheelZoom={true} zoomControl={false}
        style={{ height: '100%', width: '100%' }}>
        <CustomZoomControls />
        <TileLayer 
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapSync reports={reports} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />

        <Circle center={center} radius={10000}
          pathOptions={{ fillColor: 'var(--accent-electric-blue)', fillOpacity: 0.03, color: 'var(--accent-electric-blue)', weight: 1, dashArray: '5, 10' }} />

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
          <Circle
            key={`hz-pulse-${h.id}`}
            center={[h.latitude, h.longitude]}
            radius={HAZARD_RADIUS * (1 + 0.18 * pulseFactor)}
            pathOptions={{
              fillColor: 'var(--accent-magenta)',
              fillOpacity: 0.06,
              color: 'var(--accent-magenta)',
              weight: 1,
              dashArray: '4, 10',
              opacity: 0.55,
            }}
          />,
          <Circle
            key={`hz-${h.id}`}
            center={[h.latitude, h.longitude]}
            radius={HAZARD_RADIUS}
            pathOptions={{
              fillColor: 'var(--accent-magenta)',
              fillOpacity: 0.12,
              color: 'var(--accent-magenta)',
              weight: 2,
              opacity: 0.85,
            }}
          />,
        ])}

        {source && (
          <Marker position={source} icon={sourceIcon()}>
            <Popup><b>Source</b></Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={destination} icon={destIcon()}>
            <Popup><b>Destination</b></Popup>
          </Marker>
        )}

        {reports.map((r) => {
          const isHz = hazards.some((h) => h.id === r.id);
          const color = r.status === 'RESOLVED' ? 'var(--accent-lime)' : catColor(r.category);
          const radius = 6 + ((r.priorityScore ?? 0.5) * 8);
          return (
            <CircleMarker
              key={r.id}
              center={[r.latitude, r.longitude]}
              radius={radius}
              pathOptions={{
                color: 'transparent',
                fillColor: isHz ? 'var(--accent-magenta)' : color,
                fillOpacity: isHz ? 0.85 : 0.7,
              }}
            >
              <Popup>
                <div className="min-w-[160px]">
                  <b className="text-sm">{r.title}</b>
                  <p className="text-xs text-slate-500 uppercase">{r.status}</p>
                  <p className="text-xs text-slate-500 uppercase">{r.category}</p>
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
