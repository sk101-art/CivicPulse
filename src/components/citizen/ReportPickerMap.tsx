'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

interface ReportPickerMapProps {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
}

function LocationPicker({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function MapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== 0 && lng !== 0) {
      map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

export default function ReportPickerMap({ latitude, longitude, onChange }: ReportPickerMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  const markerIcon = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return L.divIcon({
      className: '',
      html: `
        <div style="position: relative; width: 24px; height: 24px;">
          <div style="
            position: absolute; inset: -10px;
            background: var(--accent-cyan);
            border-radius: 50%;
            opacity: 0.3;
            animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            position: absolute; inset: 0;
            background: var(--accent-cyan);
            border: 3px solid #FFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 0 15px var(--accent-cyan);
          "></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <div className="w-full h-full bg-white/5 animate-pulse" />;

  return (
    <MapContainer
      center={[latitude || 40.7128, longitude || -74.0060]}
      zoom={15}
      className="w-full h-full z-10"
      scrollWheelZoom
      style={{ height: '100%', minHeight: '100%', width: '100%', zIndex: 10, background: '#0A0A0B' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapInvalidator />
      <MapController lat={latitude} lng={longitude} />
      <LocationPicker onChange={onChange} />
      {latitude !== 0 && longitude !== 0 && (
         <Marker position={[latitude, longitude]} icon={markerIcon as any} />
      )}
    </MapContainer>
  );
}
