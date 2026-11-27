'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  Minus,
  Crosshair,
  MapPin,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Inbox,
  Search,
  LocateFixed,
  Copy,
  Check,
  X,
  ImageOff,
  Map as MapIcon,
  List as ListIcon,
} from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Category } from '@prisma/client';
import { useGeoContext } from '@/context/GeoContext';
import { CartoConfigNotice } from '@/components/map/CartoTileLayer';
import { MapCoordinateList } from './MapCoordinateList';
import {
  buildStatusPinHtml,
  getMapStatusMeta,
  MAP_STATUS_FILTER_OPTIONS,
  matchesStatusFilter,
} from '@/lib/map/statusPresentation';
import { clusterMapIssues } from '@/lib/map/cluster';
import { haversineDistanceM } from '@/lib/geo/distance';
import { formatDateIST } from '@/lib/time/ist';

const CartoTileLayer = dynamic(
  () => import('@/components/map/CartoTileLayer').then((mod) => mod.CartoTileLayer),
  { ssr: false }
);
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
  category: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  distance?: string;
  distanceReference?: 'user' | 'ward';
  status: string;
  statusLabel: string;
  priority: string;
  reportedAt?: string;
  repairClaimedAt?: string | null;
  agencyName?: string | null;
  assignedPersonnel?: string | null;
  photoUrl?: string;
  note?: string | null;
}

export interface IssuesNearMeMapProps {
  initialIssues?: IssueItem[];
}

const PRIORITY_FILTERS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function IssuesNearMeMap({ initialIssues }: IssuesNearMeMapProps) {
  const searchParams = useSearchParams();
  const {
    currentWard,
    wardData,
    selectedCategory,
    setSelectedCategory,
    refreshWardData,
    loadMoreWardIssues,
  } = useGeoContext();

  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(14);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [deepLinkTarget, setDeepLinkTarget] = useState<{ lat: number; lng: number; issueId?: string } | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locateLoading, setLocateLoading] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const urlInitializedRef = useRef(false);
  const lastWardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  // Initialize viewMode, ?category=, and ?lat=&lng=&issueId= once on direct URL entry
  useEffect(() => {
    if (urlInitializedRef.current) return;
    urlInitializedRef.current = true;
    const rawCat = searchParams?.get('category');
    if (rawCat) {
      const upper = rawCat.trim().toUpperCase().replace(/\s+/g, '_');
      if (upper === 'ALL' || Object.values(Category).includes(upper as Category)) {
        setSelectedCategory(upper);
      }
    }

    const rawView = searchParams?.get('view')?.toLowerCase();
    const rawLat = searchParams?.get('lat');
    const rawLng = searchParams?.get('lng');
    const rawIssueId = searchParams?.get('issueId');

    if (rawLat !== null && rawLng !== null) {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        setViewMode('map');
        setDeepLinkTarget({ lat, lng, issueId: rawIssueId || undefined });
        if (rawIssueId) setSelectedIssueId(rawIssueId);
        return;
      }
    }

    if (rawView === 'list') {
      setViewMode('list');
    } else if (rawView === 'map') {
      setViewMode('map');
    }
  }, [searchParams, setSelectedCategory]);

  // Fly to deep-link coordinates once mapInstance is ready
  useEffect(() => {
    if (!mapInstance || !deepLinkTarget || viewMode !== 'map') return;
    mapInstance.flyTo([deepLinkTarget.lat, deepLinkTarget.lng], 16, { duration: 0.6 });
  }, [mapInstance, deepLinkTarget, viewMode]);

  // Clear deep-link override if user explicitly switches wards
  useEffect(() => {
    const wid = currentWard?.id ?? null;
    if (lastWardIdRef.current && wid && lastWardIdRef.current !== wid) {
      setDeepLinkTarget(null);
    }
    lastWardIdRef.current = wid;
  }, [currentWard?.id]);

  const switchViewMode = (mode: 'map' | 'list', extraParams?: { lat?: number; lng?: number; issueId?: string }) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', mode);
      if (extraParams?.lat !== undefined && extraParams?.lng !== undefined) {
        url.searchParams.set('lat', extraParams.lat.toFixed(6));
        url.searchParams.set('lng', extraParams.lng.toFixed(6));
        if (extraParams.issueId) url.searchParams.set('issueId', extraParams.issueId);
      } else if (mode === 'list') {
        url.searchParams.delete('lat');
        url.searchParams.delete('lng');
        url.searchParams.delete('issueId');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Track map zoom for marker clustering
  useEffect(() => {
    if (!mapInstance) return;
    const updateZoom = () => setMapZoom(mapInstance.getZoom());
    updateZoom();
    mapInstance.on('zoomend', updateZoom);
    return () => {
      mapInstance.off('zoomend', updateZoom);
    };
  }, [mapInstance]);

  const centerCoords: [number, number] = useMemo(() => {
    if (currentWard?.lat && currentWard?.lng) {
      return [currentWard.lat, currentWard.lng];
    }
    return [12.9716, 77.5946];
  }, [currentWard]);

  const wardIssues: IssueItem[] = useMemo(() => {
    if (wardData.issues && wardData.issues.length > 0) {
      return wardData.issues.map((i) => {
        const refLat = userLocation ? userLocation.lat : centerCoords[0];
        const refLng = userLocation ? userLocation.lng : centerCoords[1];
        const distM = Math.round(haversineDistanceM(refLat, refLng, i.lat, i.lng));
        const distanceStr = distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`;

        return {
          id: i.id,
          category: i.category,
          title: i.title,
          location: i.location,
          lat: i.lat,
          lng: i.lng,
          distance: distanceStr,
          distanceReference: userLocation ? 'user' : 'ward',
          status: i.status,
          statusLabel: i.statusLabel,
          priority: i.priority,
          reportedAt: i.createdAt,
          repairClaimedAt: i.repairClaimedAt ?? null,
          agencyName: i.agencyName ?? null,
          assignedPersonnel: i.assignedPersonnel ?? null,
          photoUrl: i.photoUrl,
          note: i.note ?? null,
        };
      });
    }

    if (wardData.isLoading && initialIssues) {
      return initialIssues;
    }

    return [];
  }, [wardData.issues, wardData.isLoading, initialIssues, centerCoords, userLocation]);

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

  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return wardIssues.filter((i) => {
      const catOk =
        selectedCategory === 'ALL' || i.category.toUpperCase() === selectedCategory.toUpperCase();
      const statusOk = matchesStatusFilter(i.status, selectedStatus);
      const prioOk =
        selectedPriority === 'ALL' || i.priority.toUpperCase() === selectedPriority.toUpperCase();
      const searchOk =
        !q ||
        i.title.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q) ||
        i.category.toLowerCase().replace(/_/g, ' ').includes(q) ||
        (i.note && i.note.toLowerCase().includes(q));
      return catOk && statusOk && prioOk && searchOk;
    });
  }, [wardIssues, selectedCategory, selectedStatus, selectedPriority, searchQuery]);

  const clusteredItems = useMemo(
    () => clusterMapIssues(filteredIssues, mapZoom),
    [filteredIssues, mapZoom]
  );

  const selectedIssue = useMemo(
    () => filteredIssues.find((i) => i.id === selectedIssueId) || null,
    [filteredIssues, selectedIssueId]
  );

  const hasActiveFilters =
    selectedCategory !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedPriority !== 'ALL' ||
    searchQuery.trim().length > 0;

  const clearAllFilters = () => {
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedPriority('ALL');
    setSearchQuery('');
  };

  const handleLocateMe = () => {
    setLocateError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('Geolocation is not supported by your browser.');
      return;
    }
    setLocateLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setLocateLoading(false);
        if (mapInstance) {
          mapInstance.flyTo([coords.lat, coords.lng], 15, { duration: 0.7 });
        }
      },
      (err) => {
        setLocateLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocateError('Location permission denied. Showing distances from ward centre.');
        } else {
          setLocateError('Unable to determine your GPS location. Showing distances from ward centre.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const getIssuePinIcon = useCallback((status: string, isSelected: boolean) => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    return L.divIcon({
      className: 'custom-pin-marker',
      html: buildStatusPinHtml(status, isSelected),
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -38],
    });
  }, []);

  const getClusterIcon = useCallback((count: number, hasCritical: boolean) => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    const bg = hasCritical ? '#B76F60' : '#355858';
    return L.divIcon({
      className: 'custom-cluster-marker',
      html: `<div style="width:36px;height:36px;border-radius:9999px;background:${bg};color:#fff;border:3px solid #fff;box-shadow:0 4px 12px rgba(41,55,50,0.3);display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:12px;font-weight:700;">${count}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }, []);

  const getUserLocationIcon = useCallback(() => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    return L.divIcon({
      className: 'user-gps-marker',
      html: `<div style="width:20px;height:20px;border-radius:9999px;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.22);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }, []);

  const getWardCenterIcon = useCallback(() => {
    if (typeof window === 'undefined') return undefined;
    const L = require('leaflet');
    return L.divIcon({
      className: 'custom-ward-center-pin pointer-events-none',
      html: `
        <div style="width: 28px; height: 28px; transform: translate(-14px, -14px); pointer-events: none;" class="relative flex items-center justify-center pointer-events-none">
          <span class="absolute w-7 h-7 rounded-full bg-[#527B7A]/25 animate-ping pointer-events-none"></span>
          <span class="relative w-4.5 h-4.5 rounded-full bg-[#355858] border-2 border-white shadow-md flex items-center justify-center pointer-events-none">
            <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
          </span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }, []);

  const handleRecenter = () => {
    setDeepLinkTarget(null);
    if (!mapInstance) return;
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
  };

  const handleSelectIssue = (issue: IssueItem) => {
    setSelectedIssueId(issue.id);
    if (mapInstance) {
      mapInstance.flyTo([issue.lat, issue.lng], Math.max(16, mapZoom), { duration: 0.6 });
    }
  };

  const copyIssueCoords = (issue: IssueItem) => {
    navigator.clipboard.writeText(`${issue.lat.toFixed(6)}, ${issue.lng.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 1800);
  };

  const handleLocateFromList = (issue: IssueItem) => {
    setSelectedIssueId(issue.id);
    setDeepLinkTarget({ lat: issue.lat, lng: issue.lng, issueId: issue.id });
    switchViewMode('map', { lat: issue.lat, lng: issue.lng, issueId: issue.id });
  };

  if (viewMode === 'list') {
    return (
      <MapCoordinateList
        currentWard={currentWard}
        issues={filteredIssues}
        totalWardIssues={wardIssues.length}
        pagination={wardData.pagination}
        isLoading={wardData.isLoading}
        error={wardData.error}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        categoryFilters={categoryFilters}
        onClearFilters={clearAllFilters}
        hasActiveFilters={hasActiveFilters}
        onSwitchToMap={() => switchViewMode('map')}
        onLocateOnMap={handleLocateFromList}
        onRefresh={refreshWardData}
        onLoadMore={loadMoreWardIssues}
      />
    );
  }

  return (
    <div className="relative w-full h-full flex overflow-hidden font-body bg-[#F3F2EB]">
      {/* Map | List Switcher Pill */}
      <div className="absolute top-4 right-16 z-[1000] inline-flex items-center p-1 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DDDCD3] shadow-[0_2px_10px_rgba(41,55,50,0.1)] pointer-events-auto">
        <button
          type="button"
          data-testid="view-mode-map"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#355858] text-white shadow-xs cursor-default"
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>Map</span>
        </button>
        <button
          type="button"
          data-testid="view-mode-list"
          onClick={() => switchViewMode('list')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#65736B] hover:text-[#293732] transition-colors cursor-pointer"
        >
          <ListIcon className="w-3.5 h-3.5" />
          <span>List</span>
        </button>
      </div>
      {/* Missing Ward Geometry Banner */}
      {currentWard && currentWard.hasGeometry === false && !currentWard.boundaryGeoJson && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-amber-300 shadow-[0_4px_16px_rgba(41,55,50,0.12)] text-xs font-semibold text-[#293732] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Boundary not registered for {currentWard.fullName || currentWard.name}. Showing ward center.</span>
        </div>
      )}

      {/* Locate Error Banner */}
      {locateError && (
        <div
          data-testid="locate-error-banner"
          className="absolute top-12 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-[#EAC8C1] shadow-md text-xs text-[#B76F60] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{locateError}</span>
          <button type="button" onClick={() => setLocateError(null)} className="ml-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* API Error Banner with Retry */}
      {wardData.error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-red-300 shadow-[0_4px_16px_rgba(41,55,50,0.12)] text-xs text-red-800 flex items-center gap-3">
          <span>{wardData.error}</span>
          <button
            type="button"
            onClick={refreshWardData}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Pill */}
      {wardData.isLoading && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[999] px-3.5 py-1.5 bg-white/90 backdrop-blur-md rounded-full border border-[#DDDCD3] shadow-md text-xs text-[#293732] flex items-center gap-2 pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#527B7A]" />
          <span>Refreshing {currentWard?.wardLabel || 'Ward'} data...</span>
        </div>
      )}

      {/* Top-Right Map Utility Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          data-testid="locate-me-btn"
          onClick={handleLocateMe}
          disabled={locateLoading}
          title="Locate Me (Use my GPS)"
          className={`w-10 h-10 rounded-2xl border shadow-[0_2px_8px_rgba(41,55,50,0.08)] flex items-center justify-center transition-all cursor-pointer ${
            userLocation
              ? 'bg-[#EAF2F0] border-[#527B7A] text-[#355858]'
              : 'bg-white border-[#DDDCD3] text-[#293732] hover:bg-[#FAF9F5]'
          }`}
        >
          {locateLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#527B7A]" />
          ) : (
            <LocateFixed className="w-4 h-4 text-[#527B7A]" />
          )}
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          title="Center on Ward"
          className="w-10 h-10 rounded-2xl bg-white border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.08)] flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer"
        >
          <Crosshair className="w-4 h-4 text-[#527B7A]" />
        </button>

        <button
          type="button"
          onClick={refreshWardData}
          title="Refresh Ward Data"
          className="w-10 h-10 rounded-2xl bg-white border border-[#DDDCD3] shadow-[0_2px_8px_rgba(41,55,50,0.08)] flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#527B7A] ${wardData.isLoading ? 'animate-spin' : ''}`} />
        </button>

        <div className="flex flex-col bg-white border border-[#DDDCD3] rounded-2xl shadow-[0_2px_8px_rgba(41,55,50,0.08)] overflow-hidden">
          <button
            type="button"
            onClick={() => mapInstance?.zoomIn()}
            title="Zoom in"
            className="w-10 h-10 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] border-b border-[#DDDCD3] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#293732]" />
          </button>
          <button
            type="button"
            onClick={() => mapInstance?.zoomOut()}
            title="Zoom out"
            className="w-10 h-10 flex items-center justify-center text-[#293732] hover:bg-[#FAF9F5] transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4 text-[#293732]" />
          </button>
        </div>
      </div>

      {/* Collapsed Drawer Re-open Button */}
      {!sidebarOpen && (
        <button
          type="button"
          data-testid="open-ward-issues-btn"
          onClick={() => setSidebarOpen(true)}
          title="Open Ward Issues Panel"
          aria-label="Open Ward Issues Panel"
          className="absolute top-4 left-4 z-[1000] px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DDDCD3] shadow-[0_4px_16px_rgba(41,55,50,0.12)] flex items-center gap-2.5 text-xs font-semibold text-[#293732] hover:bg-[#FAF9F5] transition-all cursor-pointer select-none"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#527B7A]" />
          <span>{currentWard?.wardLabel || 'Ward'} Issues ({filteredIssues.length})</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#929B92]" />
        </button>
      )}

      {/* Left Floating Issue Exploration Drawer */}
      <div
        data-testid="ward-issues-drawer"
        className={`absolute top-4 bottom-24 left-4 z-[1000] w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-3xl border border-[#DDDCD3] shadow-[0_16px_36px_rgba(41,55,50,0.12),0_4px_12px_rgba(41,55,50,0.06)] flex flex-col transition-all duration-300 ${
          sidebarOpen
            ? 'translate-x-0 opacity-100 pointer-events-auto'
            : '-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#DDDCD3] flex items-start justify-between gap-3 bg-[#FAF9F5]/70 rounded-t-3xl">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#527B7A] shrink-0" />
              <h2 className="font-display font-bold text-base sm:text-lg text-[#293732] truncate">
                {currentWard?.fullName || 'Ward Issues'}
              </h2>
            </div>
            <p className="text-xs text-[#65736B] pl-4.5 flex flex-wrap items-center gap-1.5">
              <span>
                {filteredIssues.length}
                {wardData.pagination?.total && wardData.pagination.total > wardIssues.length
                  ? ` of ${wardData.pagination.total}`
                  : ''}{' '}
                {filteredIssues.length === 1 ? 'issue' : 'issues'}
              </span>
              <span>•</span>
              <span className="font-medium text-[#527B7A]">
                {selectedCategory === 'ALL' ? 'All Categories' : selectedCategory.replace(/_/g, ' ')}
              </span>
              {selectedStatus !== 'ALL' && (
                <>
                  <span>•</span>
                  <span className="font-medium text-[#293732]">{selectedStatus.replace(/_/g, ' ')}</span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            data-testid="collapse-ward-issues-btn"
            onClick={() => setSidebarOpen(false)}
            title="Collapse ward issues panel"
            aria-label="Collapse ward issues panel"
            className="p-2 rounded-xl bg-white/90 hover:bg-[#E5E9E3] border border-[#DDDCD3] text-[#527B7A] hover:text-[#355858] shadow-xs transition-all cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.4]" />
          </button>
        </div>

        {/* Search & Priority Filters (Replaces duplicated 12-category grid) */}
        <div className="px-4 py-3 border-b border-[#DDDCD3]/60 bg-white space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#929B92] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="map-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, road, notes, category..."
              className="w-full pl-8 pr-7 py-2 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs text-[#293732] placeholder:text-[#929B92] focus:bg-white focus:border-[#527B7A] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#929B92] hover:text-[#293732] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {PRIORITY_FILTERS.map((prio) => (
                <button
                  key={prio}
                  type="button"
                  onClick={() => setSelectedPriority(prio)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    selectedPriority === prio
                      ? 'bg-[#355858] text-white border-[#355858]'
                      : 'bg-[#FAF9F5] text-[#65736B] border-[#DDDCD3] hover:text-[#293732]'
                  }`}
                >
                  {prio === 'ALL' ? 'All Priority' : prio}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] font-semibold text-[#527B7A] hover:underline shrink-0 cursor-pointer"
              >
                Clear
              </button>
            )}
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
            <div className="p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#E5E9E3] border border-[#DDDCD3] text-[#527B7A] flex items-center justify-center mx-auto">
                <Inbox className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-[#293732]">
                No matching issues in {currentWard?.wardLabel || 'this ward'}
              </div>
              <p className="text-[11px] text-[#65736B] max-w-[220px] mx-auto leading-relaxed">
                {hasActiveFilters
                  ? 'No defects match your current search, category, status, or priority filters.'
                  : 'This area is currently free of registered defects.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-3 py-1.5 rounded-xl bg-[#FAF9F5] border border-[#DDDCD3] text-xs font-semibold text-[#355858] hover:bg-[#E5E9E3] cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredIssues.map((issue) => {
                const isSelected = selectedIssueId === issue.id;
                const statusMeta = getMapStatusMeta(issue.status);

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
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#527B7A]">
                          <span>{issue.category.replace(/_/g, ' ')}</span>
                          <span>•</span>
                          <span>{issue.priority}</span>
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm text-[#293732] line-clamp-1">
                          {issue.title}
                        </h3>
                        <p className="text-xs text-[#65736B] truncate">
                          {issue.location}
                          {issue.distance
                            ? ` • ${issue.distance} ${issue.distanceReference === 'user' ? 'from you' : 'from ward center'}`
                            : ''}
                        </p>
                      </div>

                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0"
                        style={{
                          backgroundColor: statusMeta.badgeBg,
                          color: statusMeta.badgeText,
                          borderColor: statusMeta.badgeBorder,
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>
                );
              })}

              {wardData.pagination?.hasMore && hasActiveFilters && (
                <div className="px-3 py-2 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] text-[11px] text-[#B68B63]">
                  Filtering {wardIssues.length} loaded of {wardData.pagination.total} ward issues. Load more below to search all records.
                </div>
              )}

              {wardData.pagination?.hasMore && loadMoreWardIssues && (
                <button
                  type="button"
                  onClick={() => void loadMoreWardIssues()}
                  className="w-full py-2 rounded-xl bg-[#FAF9F5] hover:bg-[#E5E9E3] border border-[#DDDCD3] text-xs font-semibold text-[#355858] transition-colors cursor-pointer"
                >
                  Load More ({wardData.pagination.total - wardIssues.length} remaining)
                </button>
              )}
            </>
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

      {/* Selected Issue Rich Preview Card */}
      {selectedIssue && (
        <div
          data-testid="selected-issue-preview"
          className="hidden md:flex flex-col absolute bottom-24 right-4 z-[1000] w-80 bg-white/95 backdrop-blur-md rounded-2xl border border-[#DDDCD3] shadow-[0_16px_36px_rgba(41,55,50,0.16)] overflow-hidden"
        >
          <div className="relative h-32 bg-[#E9ECE6]">
            {selectedIssue.photoUrl && !brokenImages[selectedIssue.id] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={selectedIssue.photoUrl}
                alt={selectedIssue.title}
                onError={() => setBrokenImages((prev) => ({ ...prev, [selectedIssue.id]: true }))}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[#65736B] gap-1">
                <ImageOff className="w-5 h-5 text-[#929B92]" />
                <span>Photo unavailable</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSelectedIssueId(null)}
              aria-label="Close issue preview"
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-[#DDDCD3] flex items-center justify-center text-[#293732] hover:bg-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase text-[#527B7A]">
                {selectedIssue.category.replace(/_/g, ' ')} • {selectedIssue.priority}
              </span>
              <span className="font-semibold text-[10px] px-2 py-0.5 rounded-full bg-[#FAF9F5] border border-[#DDDCD3] text-[#293732]">
                {selectedIssue.statusLabel}
              </span>
            </div>

            <div>
              <h4 className="font-display font-semibold text-sm text-[#293732] line-clamp-1">
                {selectedIssue.title}
              </h4>
              <p className="text-[11px] text-[#65736B] line-clamp-1">
                {selectedIssue.location}
                {currentWard?.wardLabel ? ` · ${currentWard.wardLabel}` : ''}
              </p>
              {selectedIssue.note && (
                <p className="text-[11px] text-[#293732] mt-1 line-clamp-2 italic">
                  &quot;{selectedIssue.note}&quot;
                </p>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF9F5] border border-[#E5E9E3] space-y-1 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#65736B]">Coordinates</span>
                <button
                  type="button"
                  onClick={() => copyIssueCoords(selectedIssue)}
                  className="inline-flex items-center gap-1 font-mono text-[#293732] hover:text-[#527B7A] cursor-pointer"
                >
                  <span>
                    {selectedIssue.lat.toFixed(5)}°, {selectedIssue.lng.toFixed(5)}°
                  </span>
                  {copiedCoords ? <Check className="w-3 h-3 text-[#537C60]" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              {selectedIssue.distance && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#65736B]">Distance</span>
                  <span className="font-mono text-[#293732]">
                    {selectedIssue.distance} ({selectedIssue.distanceReference === 'user' ? 'from your GPS' : 'from ward center'})
                  </span>
                </div>
              )}
              {selectedIssue.reportedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#65736B]">Reported</span>
                  <span className="font-mono text-[#293732]">{formatDateIST(selectedIssue.reportedAt)}</span>
                </div>
              )}
              {selectedIssue.repairClaimedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#65736B]">Repair Claimed</span>
                  <span className="font-mono text-[#527B7A]">{formatDateIST(selectedIssue.repairClaimedAt)}</span>
                </div>
              )}
            </div>

            <Link
              href={`/issue/${selectedIssue.id}`}
              className="w-full py-2 px-3 rounded-xl bg-[#355858] hover:bg-[#2E5453] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Full Issue</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Bottom Floating Status & Category Filter Dock */}
      <div className="absolute bottom-4 inset-x-0 z-[1000] flex flex-col items-center gap-2 pointer-events-none px-4">
        <div
          data-testid="map-status-filter-bar"
          className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-full px-3 py-1 border border-[#DDDCD3] shadow-[0_4px_14px_rgba(41,55,50,0.1)] flex items-center gap-1.5 overflow-x-auto max-w-full"
        >
          {MAP_STATUS_FILTER_OPTIONS.map((st) => {
            const active = selectedStatus === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id)}
                className={`inline-flex items-center gap-1.5 py-0.5 px-2.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#293732] text-white'
                    : 'text-[#65736B] hover:text-[#293732] hover:bg-[#F3F2EB]'
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
                <span
                  className={`text-[10px] font-mono px-1 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#E5E9E3] text-[#65736B]'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real Leaflet Map Canvas */}
      <div className="w-full h-full">
        <CartoConfigNotice />
        <MapContainer
          center={centerCoords}
          zoom={14}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <CartoTileLayer style="voyager" />
          <WardViewportSync
            ward={currentWard}
            onMapReady={setMapInstance}
            suppressAutoSync={Boolean(deepLinkTarget)}
          />

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

          <Marker position={centerCoords} icon={getWardCenterIcon()} interactive={false} zIndexOffset={-1000} />

          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={getUserLocationIcon()}
            >
              <Popup>
                <div className="p-2 text-xs font-semibold text-[#293732]">
                  Your GPS Location ({userLocation.lat.toFixed(5)}°, {userLocation.lng.toFixed(5)}°)
                </div>
              </Popup>
            </Marker>
          )}

          {clusteredItems.map((item) => {
            if (item.kind === 'cluster') {
              return (
                <Marker
                  key={item.id}
                  position={[item.lat, item.lng]}
                  icon={getClusterIcon(item.count, item.hasCritical)}
                  zIndexOffset={500}
                  eventHandlers={{
                    click: () => {
                      if (mapInstance) {
                        mapInstance.flyTo([item.lat, item.lng], Math.min(17, mapZoom + 2), {
                          duration: 0.5,
                        });
                      }
                    },
                  }}
                />
              );
            }

            const issue = item.issue;
            const isSelected = selectedIssueId === issue.id;
            const icon = getIssuePinIcon(issue.status, isSelected);
            const statusMeta = getMapStatusMeta(issue.status);

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
                  <div className="p-3 space-y-2 min-w-[230px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#355858]">
                        {issue.id.startsWith('CP-') ? issue.id : `CP-${issue.id.slice(-4).toUpperCase()}`}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF2F0] text-[#355858] border border-[#D0E2DF] uppercase">
                        {issue.category.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-display font-semibold text-sm text-[#293732]">
                        {issue.title}
                      </h4>
                      <p className="text-xs text-[#65736B] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#527B7A] shrink-0" />
                        <span>{issue.location}</span>
                      </p>
                    </div>

                    <div className="space-y-1 text-[11px] bg-[#FAF9F5] p-2 rounded-lg border border-[#E5E9E3]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#65736B]">Status</span>
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
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#65736B]">Coordinates</span>
                        <span className="font-mono text-[#293732]">
                          {issue.lat.toFixed(5)}°, {issue.lng.toFixed(5)}°
                        </span>
                      </div>
                      {issue.reportedAt && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#65736B]">Reported</span>
                          <span className="font-mono text-[#293732]">{formatDateIST(issue.reportedAt)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[#DDDCD3]">
                      {issue.distance ? (
                        <span className="text-[10px] font-mono text-[#65736B]">
                          {issue.distance} ({issue.distanceReference === 'user' ? 'from you' : 'ward center'})
                        </span>
                      ) : (
                        <span />
                      )}
                      <Link
                        href={`/issue/${issue.id}`}
                        className="font-semibold text-[#527B7A] hover:text-[#355858] flex items-center gap-0.5"
                      >
                        <span>View Full Issue</span>
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
