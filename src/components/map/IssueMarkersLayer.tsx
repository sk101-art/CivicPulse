import React from "react";
import { CircleMarker, Popup } from "react-leaflet";
import Link from "next/link";
import { ReportPoint } from "./types";

const CATEGORY_COLORS: Record<string, string> = {
  POTHOLES: "var(--cat-potholes)",
  DRAINAGE: "var(--cat-drainage)",
  WATERLOGGING: "var(--cat-drainage)",
  STREETLIGHTS: "var(--cat-streetlights)",
  SIDEWALKS: "var(--cat-sidewalks)",
  FOOTPATH: "var(--cat-sidewalks)",
  TRAFFIC_SIGNS: "var(--cat-traffic_signs)",
  ROAD_CUT: "var(--cat-potholes)",
  TREE_FALL: "var(--cat-drainage)",
  GRAFFITI: "var(--cat-graffiti)",
  TRASH: "var(--cat-trash)",
  OTHER: "var(--cat-other)",
};

export function getCategoryColor(category: string): string {
  const norm = category?.toUpperCase().replace(/\s+/g, "_");
  return CATEGORY_COLORS[norm] || "var(--accent-electric-blue)";
}

export interface IssueMarkersLayerProps {
  reports: ReportPoint[];
  hazards?: Array<{ id: string; latitude: number; longitude: number }>;
  pulse?: number;
  nowMs?: number;
}

export function IssueMarkersLayer({
  reports,
  hazards = [],
  pulse = 0,
  nowMs = 0,
}: IssueMarkersLayerProps) {
  const pulseFactor = (Math.sin(pulse * 0.1) + 1) / 2;

  return (
    <>
      {reports.map((r) => {
        const lat = r.latitude ?? r.lat;
        const lng = r.longitude ?? r.lng;
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
          return null;
        }

        const isHz = hazards.some((h) => h.id === r.id);
        const color =
          r.status === "RESOLVED" || r.status === "VERIFIED_FIXED"
            ? "var(--accent-lime)"
            : getCategoryColor(r.category);

        const priorityScore = r.priorityScore ?? (r.priority ? r.priority / 100 : 0.5);
        const radius = 6 + priorityScore * 8;

        const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : null;
        const isNew = createdAt != null && nowMs - createdAt < 60 * 60 * 1000;
        const effectiveRadius = isNew ? radius * (1 + 0.12 * pulseFactor) : radius;

        return (
          <CircleMarker
            key={r.id}
            center={[lat, lng]}
            radius={effectiveRadius}
            pathOptions={{
              color: r.status === "OPEN" ? color : "transparent",
              fillColor: isHz ? "var(--accent-magenta)" : color,
              fillOpacity: isHz ? 0.85 : r.status === "OPEN" ? 0.2 : 0.7,
              weight: r.status === "OPEN" ? 2 : 0,
            }}
          >
            <Popup>
              <div className="min-w-[160px] p-1 font-sans">
                <b className="text-sm text-zinc-900 block font-semibold leading-snug">
                  {r.title || `${r.category.replace(/_/g, " ")} at ${r.address || "Bengaluru"}`}
                </b>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 uppercase font-bold">
                    {r.status}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {r.category.replace(/_/g, " ")}
                  </span>
                </div>

                {isHz && (
                  <p className="text-xs font-bold mt-1.5 text-rose-600 flex items-center gap-1">
                    ⚠ Hazard zone on route
                  </p>
                )}

                <div className="mt-2 pt-2 border-t border-zinc-200">
                  <Link
                    href={`/issue/${r.id}`}
                    className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline inline-block"
                  >
                    View issue details &rarr;
                  </Link>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
