'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { 
  Plus, 
  Minus, 
  Crosshair, 
  MapPin, 
  SlidersHorizontal, 
  ChevronRight, 
  ChevronLeft,
  ExternalLink, 
  Menu, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  Loader2,
  Inbox
} from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGeoContext } from '@/context/GeoContext';

// Dynamic Leaflet components to prevent SSR window issues
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

export interface IssueItem {
  id: string;
  category: 'POTHOLES' | 'DRAINAGE' | 'STREETLIGHTS' | 'SIDEWALKS' | 'TRAFFIC_SIGNS' | 'GRAFFITI' | 'TRASH' | 'ROAD_CUT' | 'OTHER' | string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  distance?: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'CLAIMED_FIXED' | 'VERIFIED_FIXED' | 'DISPUTED' | string;
  statusLabel: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  reportedAt?: string;
  photoUrl?: string;
}

export interface IssuesNearMeMapProps {
  initialIssues?: IssueItem[];
  reports?: any[];
  showReportButton?: boolean;
  onReportLocationAction?: (lat: number, lng: number) => void;
  onReportLocation?: (lat: number, lng: number) => void;
}

export function IssuesNearMeMap({ initialIssues }: IssuesNearMeMapProps) {
  const { currentWard, wardData, selectedCategory, setSelectedCategory, refreshWardData } = useGeoContext();

  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  // Center of the current active ward
  const centerCoords: [number, number] = useMemo(() => {
    if (currentWard?.lat && currentWard?.lng) {
      return [currentWard.lat, currentWard.lng];
    }
    return [12.9716, 77.5946];
  }, [currentWard]);

  // Map issues from the wardData context (fallback to initialIssues if any)
  const wardIssues: IssueItem[] = useMemo(() => {
    if (wardData.issues && wardData.issues.length > 0) {
      return wardData.issues.map((i) => {
        // Calculate rough distance to center of ward
        const dLat = (i.lat - centerCoords[0]) * 111000;
        const dLng = (i.lng - centerCoords[1]) * 111000 * Math.cos((centerCoords[0] * Math.PI) / 180);
        const distM = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
        const distanceStr = distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`;

        return {
          id: i.id,
          category: i.category,
          title: i.title,
          location: i.location,
          lat: i.lat,
          lng: i.lng,
          distance: distanceStr,
          status: i.status,
          statusLabel: i.statusLabel,
          priority: i.priority,
          reportedAt: i.createdAt,
          photoUrl: i.photoUrl,
        };
      });
    }

    if (wardData.isLoading && initialIssues) {
      return initialIssues;
    }

    return [];
  }, [wardData.issues, wardData.isLoading, initialIssues, centerCoords]);

  // Category filter definitions with real counts from database (all 12 Prisma categories)
  const categoryFilters = useMemo(() => {
    const counts = wardData.categoryBreakdown || {};
    const totalCount = wardData.stats?.totalReported || wardIssues.length;

    return [
      { id: 'ALL', label: 'All Issues', count: totalCount, color: '#293732' },
      { id: 'POTHOLES', label: 'Potholes', count: counts['POTHOLES'] || 0, color: '#527B7A' },
      { id: 'DRAINAGE', label: 'Drainage', count: counts['DRAINAGE'] || 0, color: '#718F9E' },
      { id: 'WATERLOGGING', label: 'Waterlogging', count: counts['WATERLOGGING'] || 0, color: '#4A7C92' },
      { id: 'STREETLIGHTS', label: 'Streetlights', count: counts['STREETLIGHTS'] || 0, color: '#B68B63' },
      { id: 'SIDEWALKS', label: 'Sidewalks', count: counts['SIDEWALKS'] || 0, color: '#87917B' },
      { id: 'FOOTPATH', label: 'Footpaths', count: counts['FOOTPATH'] || 0, color: '#9AA88E' },
      { id: 'TRAFFIC_SIGNS', label: 'Traffic Signs', count: counts['TRAFFIC_SIGNS'] || 0, color: '#B76F60' },
      { id: 'ROAD_CUT', label: 'Road Cuts', count: counts['ROAD_CUT'] || 0, color: '#7A6B88' },
      { id: 'TREE_FALL', label: 'Tree Fall', count: counts['TREE_FALL'] || 0, color: '#5F8265' },
      { id: 'GRAFFITI', label: 'Graffiti', count: counts['GRAFFITI'] || 0, color: '#886B85' },
      { id: 'TRASH', label: 'Trash', count: counts['TRASH'] || 0, color: '#537C60' },
      { id: 'OTHER', label: 'Other', count: counts['OTHER'] || 0, color: '#66766D' },
    ];
  }, [wardData.categoryBreakdown, wardData.stats, wardIssues.length]);

  // Filtered issues based on selected category
  const filteredIssues = useMemo(() => {
    if (selectedCategory === 'ALL') return wardIssues;
    return wardIssues.filter((i) => i.category.toUpperCase() === selectedCategory.toUpperCase());
  }, [wardIssues, selectedCategory]);

  // Pin icon generator
  const getIssuePinIcon = useCallback((category: string, isSelected: boolean) => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');

    const colorMap: Record<string, string> = {
      POTHOLES: '#527B7A',      // Teal
      DRAINAGE: '#718F9E',      // Slate Cyan
      WATERLOGGING: '#4A7C92',  // Deep Cyan
      STREETLIGHTS: '#B68B63',  // Amber
      SIDEWALKS: '#87917B',     // Olive
      FOOTPATH: '#9AA88E',      // Sage
      TRAFFIC_SIGNS: '#B76F60', // Coral
      ROAD_CUT: '#7A6B88',      // Lavender Slate
      TREE_FALL: '#5F8265',     // Moss
      GRAFFITI: '#886B85',      // Mulberry
      TRASH: '#537C60',         // Forest
      OTHER: '#66766D',         // Mineral Gray
    };
    const color = colorMap[category.toUpperCase()] || '#527B7A';

    return L.divIcon({
      className: 'custom-pin-marker',
      html: `
        <div style="width: 32px; height: 40px; transform: translate(-16px, -40px); transition: transform 0.2s;" class="${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}">
          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="pin-shadow-${category}" x="0" y="0" width="32" height="40" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="rgba(41,55,50,0.3)"/>
              </filter>
            </defs>
            <path d="M16 38 C16 38 29 24.5 29 15 C29 7.8 23.2 2 16 2 C8.8 2 3 7.8 3 15 C3 24.5 16 38 16 38 Z" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" filter="url(#pin-shadow-${category})"/>
            <circle cx="16" cy="15" r="7.5" fill="#FFFFFF"/>
            <circle cx="16" cy="15" r="4" fill="${color}"/>
          </svg>
        </div>
      `,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -38],
    });
  }, []);

  const getWardCenterIcon = useCallback(() => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    return L.divIcon({
      className: 'custom-ward-center-pin',
      html: `
        <div style="width: 28px; height: 28px; transform: translate(-14px, -14px);" class="relative flex items-center justify-center">
          <span class="absolute w-7 h-7 rounded-full bg-[#527B7A]/25 animate-ping"></span>
          <span class="relative w-4.5 h-4.5 rounded-full bg-[#355858] border-2 border-white shadow-md flex items-center justify-center">
            <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
          </span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }, []);

  const handleZoomIn = () => {
    if (mapInstance) mapInstance.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstance) mapInstance.zoomOut();
  };

  const handleRecenter = () => {
    if (mapInstance) {
      if (currentWard?.bbox && Array.isArray(currentWard.bbox) && currentWard.bbox.length === 2) {
        try {
          const L = require('leaflet');
          const bounds = L.latLngBounds(currentWard.bbox);
          if (bounds.isValid()) {
            mapInstance.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 0.8 });
            return;
          }
        } catch {
          // fallback
        }
      }
      mapInstance.flyTo(centerCoords, 14, { duration: 0.8 });
    }
  };

  const handleSelectIssue = (issue: IssueItem) => {
    setSelectedIssueId(issue.id);
    if (mapInstance) {
      mapInstance.flyTo([issue.lat, issue.lng], 16, { duration: 0.6 });
    }
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden font-body bg-[#F3F2EB]">
      {/* ── FALLBACK STATE IF WARD HAS NO GEOMETRY ── */}
      {currentWard && currentWard.hasGeometry === false && !currentWard.boundaryGeoJson && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-amber-300 shadow-[0_4px_16px_rgba(41,55,50,0.12)] text-xs font-semibold text-[#293732] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Geographical boundary not registered for {currentWard.fullName || currentWard.name}. Displaying approximate center coordinates.</span>
        </div>
      )}

      {/* ── ERROR ALERT WITH RETRY ── */}
      {wardData.error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-red-300 shadow-[0_4px_16px_rgba(41,55,50,0.12)] text-xs text-red-800 flex items-center gap-3">
          <span>{wardData.error}</span>
          <button
            onClick={refreshWardData}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── RESTRAINED LOADING PILL ── */}
      {wardData.isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[999] px-3.5 py-1.5 bg-white/90 backdrop-blur-md rounded-full border border-[#DDDCD3] shadow-md text-xs text-[#293732] flex items-center gap-2 pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#527B7A]" />
          <span>Refreshing {currentWard?.wardLabel || 'Ward'} data...</span>
        </div>
      )}

      {/* ── TOP RIGHT MAP UTILITY CONTROLS ── */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={handleRecenter}
          title="Center on Ward"
          className="w-10 h-10 rounded-2xl bg-white border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.08)] flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer"
        >
          <Crosshair className="w-4 h-4 text-[#527B7A]" />
        </button>

        <button
          onClick={refreshWardData}
          title="Refresh Ward Data"
          className="w-10 h-10 rounded-2xl bg-white border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.08)] flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#527B7A] ${wardData.isLoading ? 'animate-spin' : ''}`} />
        </button>

        <div className="flex flex-col bg-white border border-[#DDDCD3] rounded-2xl shadow-[0_2px_8px_rgba(41,55,50,0.08)] overflow-hidden">
          <button
            onClick={handleZoomIn}
            title="Zoom in"
            className="w-10 h-10 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] border-b border-[#DDDCD3] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#293732]" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom out"
            className="w-10 h-10 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4 text-[#293732]" />
          </button>
        </div>
      </div>

      {/* ── RE-EXPAND WARD ISSUES PANEL BUTTON (WHEN COLLAPSED) ── */}
      {!sidebarOpen && (
        <button
          type="button"
          data-testid="open-ward-issues-btn"
          onClick={() => setSidebarOpen(true)}
          title="Open Ward Issues Panel"
          aria-label="Open Ward Issues Panel"
          className="absolute top-4 left-4 z-[1000] px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.12),0_1px_3px_rgba(41,55,50,0.06)] flex items-center gap-2.5 text-xs font-semibold text-[#293732] hover:bg-[#FAF9F5] hover:scale-105 active:scale-95 transition-all cursor-pointer animate-in fade-in duration-200 select-none"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#527B7A]" />
          <span>{currentWard?.wardLabel || 'Ward'} Issues ({filteredIssues.length})</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#929B92]" />
        </button>
      )}

      {/* ── LEFT FLOATING WARD ISSUES DRAWER ── */}
      <div
        data-testid="ward-issues-drawer"
        className={`absolute top-4 bottom-24 left-4 z-[1000] w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-3xl border border-[#DDDCD3] shadow-[0_16px_36px_rgba(41,55,50,0.12),0_4px_12px_rgba(41,55,50,0.06)] flex flex-col transition-all duration-300 ${
          sidebarOpen 
            ? 'translate-x-0 opacity-100 pointer-events-auto' 
            : '-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none'
        }`}
      >
        {/* Header with Ward Context & Tactile Collapse Button */}
        <div className="p-4 sm:p-5 border-b border-[#DDDCD3] flex items-start justify-between gap-3 bg-[#FAF9F5]/70 rounded-t-3xl">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#527B7A] shrink-0" />
              <h2 className="font-display font-bold text-base sm:text-lg text-[#293732] truncate">
                {currentWard?.fullName || 'Ward Infrastructure'}
              </h2>
            </div>
            <p className="text-xs text-[#65736B] pl-4.5 flex items-center gap-1.5">
              <span>{filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'}</span>
              <span>•</span>
              <span className="font-medium text-[#527B7A]">
                {selectedCategory === 'ALL' ? 'All Categories' : selectedCategory.replace(/_/g, ' ')}
              </span>
            </p>
          </div>

          {/* Tactile Collapse Control */}
          <button
            type="button"
            data-testid="collapse-ward-issues-btn"
            onClick={() => setSidebarOpen(false)}
            title="Collapse ward issues panel"
            aria-label="Collapse ward issues panel"
            className="p-2 rounded-xl bg-white/90 hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#527B7A] hover:text-[#355858] shadow-[0_1px_3px_rgba(41,55,50,0.06)] transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 hover:scale-105"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.4]" />
          </button>
        </div>

        {/* Category Breakdown Table / Pills inside Drawer */}
        <div className="px-4 py-2.5 border-b border-[#DDDCD3]/60 bg-[#FFFFFF]">
          <div className="text-[11px] font-semibold text-[#65736B] uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Category Breakdown</span>
            {wardData.isLoading && <Loader2 className="w-3 h-3 animate-spin text-[#527B7A]" />}
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pr-1">
            {categoryFilters.filter(c => c.id !== 'ALL').map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.id)}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E5E9E3] text-[#293732] font-bold border border-[#C2D7D1]'
                      : 'hover:bg-[#FAF9F5] text-[#65736B] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <span className="font-mono font-semibold ml-1">{cat.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Issue Cards */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {wardData.isLoading && wardIssues.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#527B7A] mx-auto" />
              <div className="text-xs text-[#65736B] font-medium">
                Retrieving civic issues for {currentWard?.wardLabel || 'ward'}...
              </div>
            </div>
          ) : filteredIssues.length === 0 ? (
            /* Empty State for Wards without reports */
            <div className="p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#E5E9E3] border border-[#DDDCD3] text-[#527B7A] flex items-center justify-center mx-auto">
                <Inbox className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-[#293732]">
                No issues registered in {currentWard?.wardLabel || 'this ward'}
              </div>
              <p className="text-[11px] text-[#65736B] max-w-[200px] mx-auto leading-relaxed">
                {selectedCategory !== 'ALL'
                  ? `No ${selectedCategory.toLowerCase().replace(/_/g, ' ')} issues found. Try switching category.`
                  : 'This area is currently free of registered defects.'}
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isSelected = selectedIssueId === issue.id;
              const statusStyles =
                issue.status === 'VERIFIED_FIXED'
                  ? 'bg-[#EBF3ED] text-[#537C60] border-[#CDE3D2]'
                  : issue.status === 'IN_PROGRESS' || issue.status === 'ASSIGNED'
                  ? 'bg-[#FBF5EB] text-[#B68B63] border-[#F2E2C9]'
                  : 'bg-[#EFF3F6] text-[#718F9E] border-[#D4E0E7]';

              const dotColors: Record<string, string> = {
                POTHOLES: 'bg-[#527B7A]',
                DRAINAGE: 'bg-[#718F9E]',
                WATERLOGGING: 'bg-[#4A7C92]',
                STREETLIGHTS: 'bg-[#B68B63]',
                SIDEWALKS: 'bg-[#87917B]',
                FOOTPATH: 'bg-[#9AA88E]',
                TRAFFIC_SIGNS: 'bg-[#B76F60]',
                ROAD_CUT: 'bg-[#7A6B88]',
                TREE_FALL: 'bg-[#5F8265]',
                GRAFFITI: 'bg-[#886B85]',
                TRASH: 'bg-[#537C60]',
                OTHER: 'bg-[#66766D]',
              };
              const dotColor = dotColors[issue.category.toUpperCase()] || 'bg-[#527B7A]';

              return (
                <div
                  key={issue.id}
                  onClick={() => handleSelectIssue(issue)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#EAF2F0]/80 border-[#527B7A] shadow-sm translate-x-1'
                      : 'bg-white hover:bg-[#FAF9F5] border-[#E5E9E3] hover:border-[#DDDCD3]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                        <h3 className="font-semibold text-xs sm:text-sm text-[#293732] line-clamp-1">
                          {issue.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#65736B] pl-4.5 truncate">
                        {issue.location} {issue.distance ? `• ${issue.distance}` : ''}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${statusStyles}`}>
                      {issue.statusLabel}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Report Action */}
        <div className="p-3 border-t border-[#DDDCD3] bg-[#FAF9F5]/70 rounded-b-3xl">
          <Link
            href="/citizen/report"
            className="w-full py-2.5 px-4 rounded-xl bg-[#355858] hover:bg-[#3E6966] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(53,88,88,0.25)] transition-all cursor-pointer active:translate-y-px"
          >
            <Plus className="w-4 h-4" />
            <span>Report Issue in {currentWard?.wardLabel || 'Ward'}</span>
          </Link>
        </div>
      </div>

      {/* ── BOTTOM FLOATING CATEGORY FILTER PILL BAR ── */}
      <div className="absolute bottom-6 inset-x-0 z-[1000] flex justify-center pointer-events-none px-4">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-full px-3 sm:px-5 py-1.5 sm:py-2 border border-[#DDDCD3] shadow-[0_8px_24px_rgba(41,55,50,0.12)] flex items-center gap-2 sm:gap-4 overflow-x-auto max-w-full">
          {categoryFilters.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 sm:gap-2 py-1 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#355858] text-white shadow-sm'
                    : 'text-[#65736B] hover:text-[#293732] hover:bg-[#F3F2EB]'
                }`}
              >
                {cat.id !== 'ALL' && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isActive ? '#FFFFFF' : cat.color }}
                  />
                )}
                <span>{cat.label}</span>
                <span className={`text-[10px] font-mono px-1 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-[#E5E9E3] text-[#65736B]'}`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── REAL LEAFLET MAP CANVAS ── */}
      <div className="w-full h-full">
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

          {/* Child Component using useMap() to handle dynamic ward navigation */}
          <WardViewportSync ward={currentWard} onMapReady={setMapInstance} />

          {/* Ward Geographical Boundary Polygon Layer */}
          {currentWard?.boundaryGeoJson && (
            <GeoJSON
              key={`boundary-${currentWard.id}`}
              data={currentWard.boundaryGeoJson}
              style={() => ({
                color: '#527B7A',
                weight: 2.5,
                fillColor: '#527B7A',
                fillOpacity: 0.08,
                dashArray: '6, 6',
              })}
            />
          )}

          {/* Ward Centroid Marker */}
          <Marker position={centerCoords} icon={getWardCenterIcon()} />

          {/* Filtered Issue Pins */}
          {filteredIssues.map((issue) => {
            const isSelected = selectedIssueId === issue.id;
            const icon = getIssuePinIcon(issue.category, isSelected);

            return (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedIssueId(issue.id),
                }}
              >
                <Popup>
                  <div className="p-3.5 space-y-2.5 min-w-[220px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF] uppercase tracking-wider">
                        {issue.category}
                      </span>
                      {issue.distance && (
                        <span className="text-[10px] font-mono text-[#65736B]">
                          {issue.distance} away
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-display font-semibold text-sm text-[#293732]">
                        {issue.title}
                      </h4>
                      <p className="text-xs text-[#65736B] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#527B7A]" />
                        <span>{issue.location}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#DDDCD3]">
                      <span className="font-semibold text-[#293732]">
                        Status: <span className="font-normal text-[#65736B]">{issue.statusLabel}</span>
                      </span>
                      <Link
                        href={`/issue/${issue.id}`}
                        className="font-semibold text-[#527B7A] hover:text-[#355858] flex items-center gap-0.5"
                      >
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
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

export default IssuesNearMeMap;
