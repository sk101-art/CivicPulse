'use client';

import React, { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import L from 'leaflet';
import { 
  Flame, 
  Layers, 
  AlertTriangle, 
  Clock, 
  Repeat, 
  ExternalLink, 
  ChevronRight, 
  X,
  Crosshair,
  Plus,
  Minus
} from 'lucide-react';
import type { HotspotCluster } from '@/lib/intelligence/wardAnalytics';
import 'leaflet/dist/leaflet.css';

// Dynamic Leaflet components
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
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);
const WardViewportSync = dynamic(
  () => import('@/components/map/WardViewportSync').then((mod) => mod.WardViewportSync),
  { ssr: false }
);

export type MapViewMode = 'ALL' | 'UNRESOLVED' | 'CRITICAL' | 'CATEGORY' | 'RECURRING';

interface Props {
  ward: {
    id: string;
    code: string;
    name: string;
    fullName: string;
    wardLabel: string;
    lat: number;
    lng: number;
    bbox: [[number, number], [number, number]] | null;
    hasGeometry: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boundaryGeoJson: any;
  };
  hotspots: HotspotCluster[];
  issuesGeo: Array<{
    id: string;
    category: string;
    status: string;
    band: string;
    priority: number;
    lat: number;
    lng: number;
    address: string | null;
    title: string;
    isHotspot: boolean;
    recurrenceOf: string | null;
    slaBreached: boolean;
    createdAt: string;
  }>;
  selectedCategory: string;
}

export function GeoIntelligenceMap({
  ward,
  hotspots,
  issuesGeo,
  selectedCategory,
}: Props) {
  const [viewMode, setViewMode] = useState<MapViewMode>('ALL');
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotCluster | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Center coordinates
  const centerCoords: [number, number] = useMemo(() => {
    return [ward.lat || 12.9716, ward.lng || 77.5946];
  }, [ward.lat, ward.lng]);

  // Filter issues according to ViewMode and SelectedCategory
  const filteredIssues = useMemo(() => {
    return issuesGeo.filter((i) => {
      // Category filter check
      if (selectedCategory !== 'ALL' && i.category.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }

      // View mode check
      switch (viewMode) {
        case 'UNRESOLVED':
          return i.status !== 'VERIFIED_FIXED' && i.status !== 'REJECTED';
        case 'CRITICAL':
          return i.band === 'CRITICAL' || i.band === 'HIGH' || i.priority >= 0.7;
        case 'RECURRING':
          return i.isHotspot || Boolean(i.recurrenceOf);
        case 'ALL':
        case 'CATEGORY':
        default:
          return true;
      }
    });
  }, [issuesGeo, viewMode, selectedCategory]);

  // Filter hotspots according to ViewMode
  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      switch (viewMode) {
        case 'UNRESOLVED':
          return h.representativeIssues.some((i) => i.status !== 'VERIFIED_FIXED');
        case 'CRITICAL':
          return h.priorityBreakdown.critical > 0 || h.priorityBreakdown.high > 0;
        case 'RECURRING':
          return h.recurringCount > 0;
        case 'ALL':
        case 'CATEGORY':
        default:
          return true;
      }
    });
  }, [hotspots, viewMode]);

  // Custom marker pin generator
  const getMarkerIcon = useCallback((category: string, isCritical: boolean) => {
    if (typeof window === 'undefined') return undefined;
    const color = isCritical ? '#B76F60' : '#527B7A';

    return L.divIcon({
      className: 'geo-marker-pin',
      html: `
        <div style="width: 24px; height: 32px; transform: translate(-12px, -32px);" class="hover:scale-125 transition-transform cursor-pointer">
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
            <path d="M12 30 C12 30 22 19 22 11.5 C22 6 17.5 1.5 12 1.5 C6.5 1.5 2 6 2 11.5 C2 19 12 30 12 30 Z" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
            <circle cx="12" cy="11.5" r="4.5" fill="#FFFFFF"/>
          </svg>
        </div>
      `,
      iconSize: [24, 32],
      iconAnchor: [12, 32],
    });
  }, []);

  const handleRecenter = () => {
    if (!mapInstance) return;
    if (ward.bbox) {
      try {
        const bounds = L.latLngBounds(ward.bbox);
        if (bounds.isValid()) {
          mapInstance.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 0.8 });
          return;
        }
      } catch {
        // fallback
      }
    }
    mapInstance.flyTo(centerCoords, 14, { duration: 0.8 });
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.04)] space-y-4">
      {/* Header and View Mode Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#DDDCD3]/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#B76F60]" />
            <h2 className="text-lg font-display font-bold text-[#293732] tracking-tight">
              Geographical Intelligence & Defect Density
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            Spatial concentration clusters and infrastructure hotspots derived from GPS ground evidence.
          </p>
        </div>

        {/* View Mode Toggle Pill Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl overflow-x-auto max-w-full">
          {[
            { id: 'ALL', label: 'All Issues', icon: Layers },
            { id: 'UNRESOLVED', label: 'Active Defect Density', icon: Clock },
            { id: 'CRITICAL', label: 'Critical Hotspots', icon: AlertTriangle },
            { id: 'RECURRING', label: 'Recurring Problem Areas', icon: Repeat },
          ].map((mode) => {
            const Icon = mode.icon;
            const isActive = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id as MapViewMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#355858] text-white font-semibold shadow-sm'
                    : 'text-[#65736B] hover:text-[#293732] hover:bg-[#EAECE6]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map Display Canvas */}
      <div className="relative w-full h-[500px] sm:h-[560px] rounded-2xl overflow-hidden border border-[#DDDCD3]">
        {/* Floating Controls Top-Right */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={handleRecenter}
            title="Recenter on Ward"
            className="w-9 h-9 rounded-xl bg-white border border-[#DDDCD3] shadow-md flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer"
          >
            <Crosshair className="w-4 h-4 text-[#527B7A]" />
          </button>
          <div className="flex flex-col bg-white border border-[#DDDCD3] rounded-xl shadow-md overflow-hidden">
            <button
              onClick={() => mapInstance?.zoomIn()}
              title="Zoom In"
              className="w-9 h-9 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] border-b border-[#DDDCD3] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => mapInstance?.zoomOut()}
              title="Zoom Out"
              className="w-9 h-9 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hotspot Inspection Card (Floating when clicked) */}
        {selectedHotspot && (
          <div className="absolute top-4 left-4 z-[1000] w-80 sm:w-88 bg-white/95 backdrop-blur-md rounded-2xl border border-[#DDDCD3] shadow-[0_16px_36px_rgba(41,55,50,0.15)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-[#DDDCD3]/60 pb-2.5">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#B76F60] flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  <span>Concentration Hotspot</span>
                </span>
                <h4 className="font-display font-semibold text-sm text-[#293732] mt-0.5 line-clamp-1">
                  {selectedHotspot.name}
                </h4>
              </div>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="p-1 rounded-lg hover:bg-[#FAF9F5] text-[#65736B] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 bg-[#FAF9F5] rounded-xl border border-[#DDDCD3]">
                <div className="font-mono font-bold text-base text-[#293732]">
                  {selectedHotspot.issueCount}
                </div>
                <div className="text-[10px] text-[#65736B]">Issues</div>
              </div>
              <div className="p-2 bg-[#FDF7F0] rounded-xl border border-[#F2DFCA]">
                <div className="font-mono font-bold text-base text-[#B68B63]">
                  {selectedHotspot.recurringCount}
                </div>
                <div className="text-[10px] text-[#B68B63]">Recurring</div>
              </div>
              <div className="p-2 bg-[#FAF0EE] rounded-xl border border-[#F3D2CC]">
                <div className="font-mono font-bold text-base text-[#B76F60]">
                  {selectedHotspot.priorityBreakdown.critical}
                </div>
                <div className="text-[10px] text-[#B76F60]">Critical</div>
              </div>
            </div>

            {/* Representative issues inside hotspot */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              <div className="text-[10px] font-semibold text-[#65736B] uppercase tracking-wider">
                Defects in this Corridor
              </div>
              {selectedHotspot.representativeIssues.map((iss) => (
                <Link
                  key={iss.id}
                  href={`/issue/${iss.id}`}
                  className="p-2 rounded-lg bg-[#FAF9F5] hover:bg-[#EAECE6] border border-[#E8E7DF] flex items-center justify-between text-xs transition-colors group cursor-pointer"
                >
                  <div className="truncate pr-2">
                    <div className="font-semibold text-[#293732] truncate">{iss.title}</div>
                    <div className="text-[10px] text-[#65736B]">{iss.status}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#929B92] group-hover:text-[#293732] shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <MapContainer
          center={centerCoords}
          zoom={14}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          <WardViewportSync ward={ward} onMapReady={setMapInstance} />

          {/* Ward Geographical Boundary Polygon */}
          {ward.boundaryGeoJson && (
            <GeoJSON
              key={`ward-geo-${ward.id}`}
              data={ward.boundaryGeoJson}
              style={() => ({
                color: '#527B7A',
                weight: 2.5,
                fillColor: '#527B7A',
                fillOpacity: 0.08,
                dashArray: '6, 6',
              })}
            />
          )}

          {/* Hotspot Density Circles */}
          {filteredHotspots.map((cl) => {
            const isCritical = cl.priorityBreakdown.critical > 0;
            return (
              <Circle
                key={cl.id}
                center={[cl.lat, cl.lng]}
                radius={cl.radiusMeters}
                pathOptions={{
                  color: isCritical ? '#B76F60' : '#E07A5F',
                  fillColor: isCritical ? '#B76F60' : '#E07A5F',
                  fillOpacity: Math.min(0.35, 0.15 + cl.weight * 0.25),
                  weight: 1.5,
                }}
                eventHandlers={{
                  click: () => setSelectedHotspot(cl),
                }}
              />
            );
          })}

          {/* Individual Issue Marker Pins */}
          {filteredIssues.map((issue) => {
            const isCrit = issue.band === 'CRITICAL' || issue.priority >= 0.7;
            const icon = getMarkerIcon(issue.category, isCrit);

            return (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={icon}
              >
                <Popup>
                  <div className="p-3 space-y-2 min-w-[200px]">
                    <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#527B7A]">
                      {issue.category}
                    </div>
                    <h5 className="font-display font-semibold text-xs text-[#293732]">
                      {issue.title}
                    </h5>
                    <p className="text-[11px] text-[#65736B]">
                      {issue.address || 'Ward location'}
                    </p>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[#DDDCD3]">
                      <span className="font-medium text-[#293732]">{issue.status}</span>
                      <Link
                        href={`/issue/${issue.id}`}
                        className="text-[#527B7A] hover:underline font-semibold flex items-center gap-0.5"
                      >
                        Details <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
