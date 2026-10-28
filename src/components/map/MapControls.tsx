import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { PlacementMode, ReportPoint } from "./types";

export function MapSync({ reports }: { reports: ReportPoint[] }) {
  const map = useMap();

  useEffect(() => {
    const valid = reports.filter((r) => {
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
    });

    if (valid.length > 0) {
      const bounds = L.latLngBounds(
        valid.map((r) => [(r.latitude ?? r.lat)!, (r.longitude ?? r.lng)!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [reports, map]);

  return null;
}

export function MapClickHandler({
  mode,
  onPlace,
}: {
  mode: PlacementMode;
  onPlace: (latlng: L.LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode) onPlace(e.latlng);
    },
  });
  return null;
}

export function CustomZoomControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          map.zoomIn();
        }}
        className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg transition hover:bg-gray-900"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          map.zoomOut();
        }}
        className="w-10 h-10 bg-gray-950 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center justify-center text-xl font-mono shadow-lg transition hover:bg-gray-900"
        aria-label="Zoom out"
      >
        -
      </button>
    </div>
  );
}
