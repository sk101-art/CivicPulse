'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with Next.js


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

export default function ReportPickerMap({ latitude, longitude, onChange }: ReportPickerMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  const markerIcon = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return L.divIcon({
      className: '',
      html: `
        <div style="
          width: 24px;
          height: 24px;
          background: var(--accent-cyan);
          border: 3px solid #FFF;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 0 15px var(--accent-cyan);
        "></div>
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
      center={[latitude, longitude]}
      zoom={15}
      className="w-full h-full"
      scrollWheelZoom
      style={{ background: '#0A0A0B' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <LocationPicker onChange={onChange} />
      <Marker position={[latitude, longitude]} icon={markerIcon as any} />
    </MapContainer>
  );
}
