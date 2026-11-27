'use client';

import React, { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type * as LeafletType from 'leaflet';
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
import { CartoTileLayer, CartoConfigNotice } from '@/components/map/CartoTileLayer';
import {
  buildStatusPinHtml,
  getMapStatusMeta,
  MAP_STATUS_FILTER_OPTIONS,
  matchesStatusFilter,
} from '@/lib/map/statusPresentation';

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
  mode?: 'compact-hotspot' | 'full';
}

export function GeoIntelligenceMap({
  ward,
  hotspots,
  issuesGeo,
  selectedCategory,
  mode = 'full',
}: Props) {
  const isCompactHotspot = mode === 'compact-hotspot';
  const [viewMode, setViewMode] = useState<MapViewMode>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotCluster | null>(null);
  const [mapInstance, setMapInstance] = useState<LeafletType.Map | null>(null);

  // Center coordinates
  const centerCoords: [number, number] = useMemo(() => {
    return [ward.lat || 12.9716, ward.lng || 77.5946];
  }, [ward.lat, ward.lng]);

  // Filter issues according to ViewMode, StatusFilter, and SelectedCategory
  const filteredIssues = useMemo(() => {
    return issuesGeo.filter((i) => {
      // Category filter check
      if (selectedCategory !== 'ALL' && i.category.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }

      // Status filter check
      if (!matchesStatusFilter(i.status, statusFilter)) {
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
  }, [issuesGeo, viewMode, statusFilter, selectedCategory]);

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

  // Custom marker pin generator (status-coded Civic Atlas color + shape)
  const getMarkerIcon = useCallback((status: string) => {
    if (typeof window === 'undefined') return undefined;
    const leaflet = require('leaflet');

    return leaflet.divIcon({
      className: 'geo-marker-pin',
      html: buildStatusPinHtml(status, false),
      iconSize: [32, 40],
      iconAnchor: [16, 40],
    });
  }, []);

  const handleRecenter = () => {
    if (!mapInstance) return;
    if (ward.bbox) {
      try {
        const leaflet = require('leaflet');
        const bounds = leaflet.latLngBounds(ward.bbox);
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
              {isCompactHotspot ? 'Recurring Hotspot Map' : 'Geographical Intelligence & Defect Density'}
            </h2>
          </div>
          <p className="text-xs text-[#65736B] mt-0.5">
            {isCompactHotspot
              ? 'Ward boundary and spatial clusters of recurring civic defects. Click any cluster to inspect.'
              : 'Spatial concentration clusters and infrastructure hotspots derived from GPS ground evidence.'}
          </p>
        </div>

        {isCompactHotspot ? (
          <Link
            href="/citizen/map"
            data-testid="explore-map-view-link"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858] text-xs font-semibold transition-colors self-start lg:self-auto shrink-0"
          >
            <span>Explore all issues on Map View</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#527B7A]" />
          </Link>
        ) : (
          /* View Mode Toggle Pill Bar */
          <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F5] border border-[#DDDCD3] rounded-xl overflow-x-auto max-w-full">
            {[
              { id: 'ALL', label: 'All Issues', icon: Layers },
              { id: 'UNRESOLVED', label: 'Active Defect Density', icon: Clock },
              { id: 'CRITICAL', label: 'Critical Hotspots', icon: AlertTriangle },
              { id: 'RECURRING', label: 'Recurring Problem Areas', icon: Repeat },
            ].map((m) => {
              const Icon = m.icon;
              const isActive = viewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id as MapViewMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#355858] text-white font-semibold shadow-sm'
                      : 'text-[#65736B] hover:text-[#293732] hover:bg-[#EAECE6]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Map Display Canvas */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden border border-[#DDDCD3] ${
          isCompactHotspot ? 'h-[340px] sm:h-[380px]' : 'h-[500px] sm:h-[560px]'
        }`}
      >
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

        <CartoConfigNotice />
        <MapContainer
          center={centerCoords}
          zoom={14}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <CartoTileLayer style="voyager" />

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

          {/* Individual Issue Marker Pins (Full Authority Mode only — Citizens use Map View) */}
          {!isCompactHotspot &&
            filteredIssues.map((issue) => {
              const icon = getMarkerIcon(issue.status);
              const statusMeta = getMapStatusMeta(issue.status);

              return (
                <Marker
                  key={issue.id}
                  position={[issue.lat, issue.lng]}
                  icon={icon}
                >
                  <Popup>
                    <div className="p-3 space-y-2 min-w-[210px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#527B7A]">
                          {issue.category.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[10px] text-[#65736B]">
                          {issue.band}
                        </span>
                      </div>
                      <h5 className="font-display font-semibold text-xs text-[#293732]">
                        {issue.title}
                      </h5>
                      <p className="text-[11px] text-[#65736B]">
                        {issue.address || 'Ward location'}
                      </p>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-[#DDDCD3]">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                          style={{
                            backgroundColor: statusMeta.badgeBg,
                            color: statusMeta.badgeText,
                            borderColor: statusMeta.badgeBorder,
                          }}
                        >
                          {statusMeta.label}
                        </span>
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

      {/* Status Legend & Filter Bar (Full Mode) / Compact Cluster Legend (Citizen Mode) */}
      {isCompactHotspot ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#65736B] pt-1">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B76F60]" />
              <span>Critical Hotspot Cluster</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E07A5F]" />
              <span>Defect Cluster</span>
            </span>
          </div>
          <span className="font-mono">{filteredHotspots.length} spatial clusters in ward</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {MAP_STATUS_FILTER_OPTIONS.map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#293732] text-white border-[#293732]'
                    : 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: active ? '#FFFFFF' : st.color }}
                />
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
