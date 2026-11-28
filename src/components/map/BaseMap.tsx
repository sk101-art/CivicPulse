"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ReportPoint, PlacementMode, RouteOption } from "./types";
import {
  pointToPolyDist,
  fetchAllRoutes,
  HAZARD_RADIUS_METERS,
} from "./utils";
import { MapSync, MapClickHandler, CustomZoomControls, WardViewportSync } from "./MapControls";
import { RouteLayer } from "./RouteLayer";
import { RoutePanel, VehicleMode } from "./RoutePanel";
import { IssueClustersLayer, TrafficTilesLayer, LayerControl } from "./layers";
import { CartoTileLayer, CartoConfigNotice } from "./CartoTileLayer";
import { useGeoContext } from "@/context/GeoContext";
import type { WardContextItem } from "@/context/GeoContext";

export interface BaseMapProps {
  reports: ReportPoint[];
  center?: [number, number];
  zoom?: number;
  showReportButton?: boolean;
  onReportLocation?: (lat: number, lng: number) => void;
  className?: string;
  ward?: WardContextItem | null;
}

export function BaseMap({
  reports,
  center: propCenter,
  zoom = 13,
  showReportButton = false,
  onReportLocation,
  className = "",
  ward: propWard,
}: BaseMapProps) {
  let geo: ReturnType<typeof useGeoContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    geo = useGeoContext();
  } catch {
    // Outside GeoContextProvider fallback
  }

  const activeWard = propWard !== undefined ? propWard : geo?.currentWard;
  const hasSelectedWard = Boolean(activeWard);

  const [mode, setMode] = useState<PlacementMode>(null);
  const [source, setSource] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);

  const [vehicle, setVehicle] = useState<VehicleMode>("motorcycle");
  const [beta, setBeta] = useState<number>(0.15);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [keyDisabled, setKeyDisabled] = useState<boolean>(false);

  const [showIssuesLayer, setShowIssuesLayer] = useState(true);
  const [showTrafficLayer, setShowTrafficLayer] = useState(false);

  const [allRoutes, setAllRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPulse((p) => p + 1);
      setNowMs(Date.now());
    }, 100);
    return () => window.clearInterval(t);
  }, []);

  const validReports = useMemo(() => {
    return reports
      .filter((r) => {
        const lat = r.latitude ?? r.lat;
        const lng = r.longitude ?? r.lng;
        return (
          lat != null &&
          lng != null &&
          !isNaN(lat) &&
          !isNaN(lng) &&
          isFinite(lat) &&
          isFinite(lng)
        );
      })
      .map((r) => ({
        ...r,
        latitude: (r.latitude ?? r.lat)!,
        longitude: (r.longitude ?? r.lng)!,
      }));
  }, [reports]);

  const clearRoutes = useCallback(() => {
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setRouteError(null);
    setExplanation(null);
  }, []);

  const handlePlace = useCallback(
    (latlng: L.LatLng) => {
      if (mode === "source") {
        setSource([latlng.lat, latlng.lng]);
        setMode(null);
        clearRoutes();
      } else if (mode === "destination") {
        setDestination([latlng.lat, latlng.lng]);
        setMode(null);
        clearRoutes();
      } else if (mode === "report" && onReportLocation) {
        onReportLocation(latlng.lat, latlng.lng);
        setMode(null);
      }
    },
    [mode, clearRoutes, onReportLocation]
  );

  const handleClearAll = useCallback(() => {
    setSource(null);
    setDestination(null);
    clearRoutes();
  }, [clearRoutes]);

  const currentRouteCoords = allRoutes[selectedRouteIndex]?.coords;

  const hazards = useMemo(() => {
    if (!currentRouteCoords || currentRouteCoords.length === 0) return [];
    return validReports.filter((r) => {
      const d = pointToPolyDist([r.latitude, r.longitude], currentRouteCoords);
      return d <= HAZARD_RADIUS_METERS;
    });
  }, [currentRouteCoords, validReports]);

  const optimize = useCallback(async () => {
    if (!source || !destination) return;
    setLoading(true);
    setRouteError(null);
    clearRoutes();

    try {
      // Query server safe route proxy with vehicle and safety bias (beta)
      const fetchResult = await fetchAllRoutes([source, destination], 3, {
        vehicle,
        beta,
      });

      if (fetchResult.disabled) {
        setKeyDisabled(true);
      }

      const initialRoutes = fetchResult.routes;
      if (initialRoutes.length === 0) {
        setRouteError("No driving route found between selected points.");
        setLoading(false);
        return;
      }

      setExplanation(fetchResult.explanation || null);

      const scoredInitials: RouteOption[] = initialRoutes.map((r) => {
        const hz = validReports.filter(
          (h) => pointToPolyDist([h.latitude, h.longitude], r.coords) <= HAZARD_RADIUS_METERS
        );
        return {
          coords: r.coords,
          distance: r.distance,
          duration: r.duration,
          hazardCost: r.hazardCost,
          routeScore: r.routeScore,
          hazards: hz.length,
          status: (hz.length === 0 ? "safe" : "warn") as "safe" | "warn",
          isDetour: false,
        };
      });

      const bestIdx = fetchResult.selectedRouteIndex ?? 0;
      setAllRoutes(scoredInitials);
      setSelectedRouteIndex(bestIdx < scoredInitials.length ? bestIdx : 0);
    } catch (err) {
      console.error("Route optimization failed:", err);
      setRouteError("Route computation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [source, destination, validReports, clearRoutes, vehicle, beta]);

  const mapCenter: [number, number] =
    propCenter ||
    (activeWard?.lat && activeWard?.lng
      ? [activeWard.lat, activeWard.lng]
      : validReports.length > 0
      ? [validReports[0].latitude, validReports[0].longitude]
      : [12.9716, 77.5946]);

  return (
    <div
      className={`h-full w-full rounded-2xl overflow-hidden border border-white/10 relative ${className}`}
    >
      {/* Fallback state when a ward has no geometry */}
      {activeWard && activeWard.hasGeometry === false && !activeWard.boundaryGeoJson && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-[#FAF9F5] text-[#293732] text-xs font-semibold rounded-xl shadow-lg border border-[#DDDCD3] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Geographical boundary not registered for {activeWard.fullName || activeWard.name}. Displaying approximate center.</span>
        </div>
      )}

      <LayerControl
        showIssues={showIssuesLayer}
        onToggleIssues={setShowIssuesLayer}
        showTraffic={showTrafficLayer}
        onToggleTraffic={setShowTrafficLayer}
      />

      <CartoConfigNotice />

      <RoutePanel
        mode={mode}
        setMode={setMode}
        source={source}
        destination={destination}
        loading={loading}
        onOptimize={optimize}
        onClear={handleClearAll}
        showReportButton={showReportButton}
        allRoutes={allRoutes}
        selectedRouteIndex={selectedRouteIndex}
        hazards={hazards}
        routeError={routeError}
        vehicle={vehicle}
        setVehicle={setVehicle}
        beta={beta}
        setBeta={setBeta}
        explanation={explanation}
        keyDisabled={keyDisabled}
      />

      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <CustomZoomControls />
        <CartoTileLayer style="voyager" />
        <WardViewportSync ward={activeWard} />
        <MapSync reports={reports} hasSelectedWard={hasSelectedWard} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />

        {/* Real Ward Boundary Polygon (Civic Atlas Styling) */}
        {activeWard?.boundaryGeoJson && (
          <GeoJSON
            key={`ward-boundary-${activeWard.id || activeWard.code}`}
            data={activeWard.boundaryGeoJson}
            style={() => ({
              color: "#527B7A",
              weight: 2,
              fillColor: "#527B7A",
              fillOpacity: 0.08,
              dashArray: "6, 6",
            })}
          />
        )}

        <RouteLayer
          source={source}
          destination={destination}
          allRoutes={allRoutes}
          selectedRouteIndex={selectedRouteIndex}
          hazards={hazards}
          pulse={pulse}
          onSelectRoute={setSelectedRouteIndex}
        />

        {showTrafficLayer && <TrafficTilesLayer />}

        {showIssuesLayer && (
          <IssueClustersLayer reports={validReports} nowMs={nowMs} />
        )}
      </MapContainer>
    </div>
  );
}
