"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ReportPoint, PlacementMode, RouteOption } from "./types";
import {
  pointToPolyDist,
  fetchAllRoutes,
  buildDetourWaypoints,
  HAZARD_RADIUS_METERS,
} from "./utils";
import { MapSync, MapClickHandler, CustomZoomControls } from "./MapControls";
import { IssueMarkersLayer } from "./IssueMarkersLayer";
import { RouteLayer } from "./RouteLayer";
import { RoutePanel } from "./RoutePanel";

export interface BaseMapProps {
  reports: ReportPoint[];
  center?: [number, number];
  zoom?: number;
  showReportButton?: boolean;
  onReportLocation?: (lat: number, lng: number) => void;
  className?: string;
}

export function BaseMap({
  reports,
  center: propCenter,
  zoom = 13,
  showReportButton = false,
  onReportLocation,
  className = "",
}: BaseMapProps) {
  const [mode, setMode] = useState<PlacementMode>(null);
  const [source, setSource] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);

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
      // 1. Initial direct route
      const initialRoutes = await fetchAllRoutes([source, destination], 3);
      if (initialRoutes.length === 0) {
        setRouteError("No driving route found between selected points.");
        setLoading(false);
        return;
      }

      // Check if any initial route is hazard-free
      const scoredInitials = initialRoutes.map((r) => {
        const hz = validReports.filter(
          (h) => pointToPolyDist([h.latitude, h.longitude], r.coords) <= HAZARD_RADIUS_METERS
        );
        return {
          coords: r.coords,
          distance: r.distance,
          duration: r.duration,
          hazards: hz.length,
          status: (hz.length === 0 ? "safe" : "warn") as "safe" | "warn",
          isDetour: false,
        };
      });

      const cleanDirect = scoredInitials.find((r) => r.hazards === 0);
      if (cleanDirect) {
        setAllRoutes([cleanDirect]);
        setSelectedRouteIndex(0);
        setLoading(false);
        return;
      }

      // 2. Detour optimization with lateral offsets
      const baseRoute = initialRoutes[0].coords;
      const blockingHazards = validReports.filter(
        (h) => pointToPolyDist([h.latitude, h.longitude], baseRoute) <= HAZARD_RADIUS_METERS
      );

      const offsetLevels = [40, 80, 140, 220, 320];
      const allTestedRoutes: RouteOption[] = [...scoredInitials];

      for (const offset of offsetLevels) {
        const detourPoints = buildDetourWaypoints(
          source,
          destination,
          baseRoute,
          blockingHazards,
          offset
        );
        const detourRoutes = await fetchAllRoutes(detourPoints, false);

        for (const r of detourRoutes) {
          const hz = validReports.filter(
            (h) => pointToPolyDist([h.latitude, h.longitude], r.coords) <= HAZARD_RADIUS_METERS
          );
          allTestedRoutes.push({
            coords: r.coords,
            distance: r.distance,
            duration: r.duration,
            hazards: hz.length,
            status: hz.length === 0 ? "safe" : "rerouted",
            isDetour: true,
          });
        }

        const safeRoutes = allTestedRoutes.filter((r) => r.hazards === 0);
        if (safeRoutes.length > 0) {
          setAllRoutes([safeRoutes[0]]);
          setSelectedRouteIndex(0);
          setLoading(false);
          return;
        }
      }

      // No hazard-free route found
      setAllRoutes([]);
      setRouteError(
        "No safe vehicle route found. All computed paths pass within 15m of a reported hazard. " +
          "Try adjusting your source or destination to avoid the hazard area."
      );
    } catch (err) {
      console.error("Route optimization failed:", err);
      setRouteError("Route computation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [source, destination, validReports, clearRoutes]);

  const mapCenter: [number, number] =
    propCenter ||
    (validReports.length > 0
      ? [validReports[0].latitude, validReports[0].longitude]
      : [12.9716, 77.5946]);

  return (
    <div
      className={`h-full w-full rounded-2xl overflow-hidden border border-white/10 relative ${className}`}
    >
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
      />

      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <CustomZoomControls />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapSync reports={reports} />
        <MapClickHandler mode={mode} onPlace={handlePlace} />

        <Circle
          center={mapCenter}
          radius={10000}
          pathOptions={{
            fillColor: "var(--accent-electric-blue)",
            fillOpacity: 0.03,
            color: "var(--accent-electric-blue)",
            weight: 1,
            dashArray: "5, 10",
          }}
        />

        <RouteLayer
          source={source}
          destination={destination}
          allRoutes={allRoutes}
          selectedRouteIndex={selectedRouteIndex}
          hazards={hazards}
          pulse={pulse}
          onSelectRoute={setSelectedRouteIndex}
        />

        <IssueMarkersLayer
          reports={reports}
          hazards={hazards}
          pulse={pulse}
          nowMs={nowMs}
        />
      </MapContainer>
    </div>
  );
}
