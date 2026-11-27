'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export interface WardViewportSyncProps {
  ward?: {
    id?: string;
    code?: string;
    lat?: number | null;
    lng?: number | null;
    bbox?: [[number, number], [number, number]] | null;
    boundaryGeoJson?: any;
    hasGeometry?: boolean;
  } | null;
  padding?: [number, number];
  maxZoom?: number;
  onMapReady?: (map: L.Map) => void;
  suppressAutoSync?: boolean;
}

export function WardViewportSync({
  ward,
  padding = [40, 40],
  maxZoom = 16,
  onMapReady,
  suppressAutoSync = false,
}: WardViewportSyncProps) {
  const map = useMap();
  const lastWardKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (onMapReady && map) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  // Automatically trigger Leaflet invalidateSize when sidebar toggles or container resizes
  useEffect(() => {
    if (!map) return;
    const handleResize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch (err) {
        // Safe fallback
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('civicpulse:map-resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('civicpulse:map-resize', handleResize);
    };
  }, [map]);

  useEffect(() => {
    if (!ward || !map || suppressAutoSync) return;
    const wardKey = `${ward.id || ward.code || ''}-${ward.lat}-${ward.lng}`;

    if (lastWardKeyRef.current === wardKey) {
      return;
    }
    lastWardKeyRef.current = wardKey;

    // 1. Try bounding box from PostGIS envelope
    if (ward.bbox && Array.isArray(ward.bbox) && ward.bbox.length === 2) {
      try {
        const bounds = L.latLngBounds(ward.bbox);
        if (bounds.isValid()) {
          map.flyToBounds(bounds, {
            padding,
            maxZoom,
            duration: 1.0,
          });
          return;
        }
      } catch (err) {
        console.warn('WardViewportSync bbox error:', err);
      }
    }

    // 2. Try boundary GeoJSON layer
    if (ward.boundaryGeoJson) {
      try {
        const geoLayer = L.geoJSON(ward.boundaryGeoJson);
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, {
            padding,
            maxZoom,
            duration: 1.0,
          });
          return;
        }
      } catch (err) {
        console.warn('WardViewportSync boundary error:', err);
      }
    }

    // 3. Fallback to ward centroid
    if (
      ward.lat != null &&
      ward.lng != null &&
      !isNaN(ward.lat) &&
      !isNaN(ward.lng) &&
      isFinite(ward.lat) &&
      isFinite(ward.lng)
    ) {
      map.flyTo([ward.lat, ward.lng], 14, {
        duration: 1.0,
      });
    }
  }, [ward, map, padding, maxZoom]);

  return null;
}

export default WardViewportSync;
