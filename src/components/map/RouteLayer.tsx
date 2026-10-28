import React from "react";
import { Polyline, Circle, FeatureGroup, Marker, Popup } from "react-leaflet";
import { sourceIcon, destIcon, HAZARD_RADIUS_METERS } from "./utils";
import { RouteOption } from "./types";

export interface RouteLayerProps {
  source: [number, number] | null;
  destination: [number, number] | null;
  allRoutes: RouteOption[];
  selectedRouteIndex: number;
  hazards: Array<{ id: string; latitude: number; longitude: number }>;
  pulse?: number;
  onSelectRoute?: (index: number) => void;
}

export function RouteLayer({
  source,
  destination,
  allRoutes,
  selectedRouteIndex,
  hazards,
  pulse = 0,
  onSelectRoute,
}: RouteLayerProps) {
  const pulseFactor = (Math.sin(pulse * 0.1) + 1) / 2;

  return (
    <>
      {/* Route Polylines */}
      {allRoutes.map((route, idx) => {
        const isSelected = idx === selectedRouteIndex;
        const hasHazard = isSelected && hazards.length > 0;

        return (
          <React.Fragment key={`route-group-${idx}`}>
            {hasHazard && (
              <Polyline
                positions={route.coords}
                pathOptions={{
                  color: "rgba(255,46,99,0.25)",
                  weight: 14,
                  opacity: 1,
                }}
              />
            )}
            <Polyline
              positions={route.coords}
              eventHandlers={{
                click: () => onSelectRoute?.(idx),
              }}
              pathOptions={{
                color: hasHazard
                  ? "#FF2E63"
                  : isSelected
                  ? "var(--accent-cyan, #00D4FF)"
                  : idx === 1
                  ? "var(--accent-magenta, #FF2E63)"
                  : "var(--text-muted, #71717A)",
                weight: isSelected ? 5 : 3,
                opacity: isSelected ? 1 : 0.5,
                dashArray: hasHazard ? "10, 6" : isSelected ? undefined : "8, 12",
              }}
            />
          </React.Fragment>
        );
      })}

      {/* Hazard Zone Circles */}
      {hazards.map((h) => {
        if (h.latitude == null || h.longitude == null || isNaN(h.latitude) || isNaN(h.longitude)) {
          return null;
        }
        return (
          <FeatureGroup key={`hz-group-${h.id}`}>
            <Circle
              key={`hz-pulse-${h.id}`}
              center={[h.latitude, h.longitude]}
              radius={HAZARD_RADIUS_METERS * (1 + 0.18 * pulseFactor)}
              pathOptions={{
                fillColor: "var(--accent-magenta, #FF2E63)",
                fillOpacity: 0.06,
                color: "var(--accent-magenta, #FF2E63)",
                weight: 1,
                dashArray: "4, 10",
                opacity: 0.55,
              }}
            />
            <Circle
              key={`hz-${h.id}`}
              center={[h.latitude, h.longitude]}
              radius={HAZARD_RADIUS_METERS}
              pathOptions={{
                fillColor: "var(--accent-magenta, #FF2E63)",
                fillOpacity: 0.12,
                color: "var(--accent-magenta, #FF2E63)",
                weight: 2,
                opacity: 0.85,
              }}
            />
          </FeatureGroup>
        );
      })}

      {/* Source Marker */}
      {source && (
        <Marker position={source} icon={sourceIcon()}>
          <Popup>
            <b>Source</b>
          </Popup>
        </Marker>
      )}

      {/* Destination Marker */}
      {destination && (
        <Marker position={destination} icon={destIcon()}>
          <Popup>
            <b>Destination</b>
          </Popup>
        </Marker>
      )}
    </>
  );
}
