"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ReportPoint, PlacementMode, RouteOption } from "./types";
import {
  pointToPolyDist,
  fetchAllRoutes,
  HAZARD_RADIUS_METERS,
} from "./utils";
import { MapSync, MapClickHandler, CustomZoomControls } from "./MapControls";
import { IssueMarkersLayer } from "./IssueMarkersLayer";
import { RouteLayer } from "./RouteLayer";
import { RoutePanel, VehicleMode } from "./RoutePanel";

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

  const [vehicle, setVehicle] = useState<VehicleMode>("motorcycle");
  const [beta, setBeta] = useState<number>(0.15);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [keyDisabled, setKeyDisabled] = useState<boolean>(false);

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
