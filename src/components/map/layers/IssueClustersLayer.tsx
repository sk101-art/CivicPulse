"use client";

import React, { useMemo, useState } from "react";
import { CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import Link from "next/link";
import { ReportPoint } from "../types";

export interface IssueClustersLayerProps {
  reports: ReportPoint[];
  nowMs?: number;
}

interface ClusterGroup {
  id: string;
  lat: number;
  lng: number;
  reports: ReportPoint[];
  highestBand: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

const BAND_COLORS: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW", string> = {
  CRITICAL: "#F43F5E", // Rose
  HIGH: "#F59E0B",     // Amber
  MEDIUM: "#0EA5E9",   // Sky
  LOW: "#A1A1AA",      // Zinc
};

const BAND_BG: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW", string> = {
  CRITICAL: "rgba(244, 63, 94, 0.25)",
  HIGH: "rgba(245, 158, 11, 0.25)",
  MEDIUM: "rgba(14, 165, 233, 0.25)",
  LOW: "rgba(161, 161, 170, 0.25)",
};

function getReportBand(r: ReportPoint): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const p = r.priorityScore ?? r.priority ?? 0;
  // If priority is given on 0-1 scale vs 0-100 scale:
  const normalized = p <= 1.0 && p > 0 ? p * 100 : p;
  if (normalized >= 80) return "CRITICAL";
  if (normalized >= 60) return "HIGH";
  if (normalized >= 40) return "MEDIUM";
  return "LOW";
}

function getWorstBand(
  bands: Array<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">
): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (bands.includes("CRITICAL")) return "CRITICAL";
  if (bands.includes("HIGH")) return "HIGH";
  if (bands.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

export function IssueClustersLayer({
  reports,
  nowMs = 0,
}: IssueClustersLayerProps) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend: () => {
      setCurrentZoom(map.getZoom());
    },
  });

  // Valid reports with valid coordinates
  const validReports = useMemo(() => {
    return reports.filter((r) => {
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
  }, [reports]);

  // Cluster algorithm: at zoom < 15, group reports within grid cells
  const clusters = useMemo(() => {
    if (currentZoom >= 15) {
      // Zoomed in: no clustering needed
      return [];
    }

    // Grid size in degrees based on zoom
    const cellSize = 0.05 / Math.pow(2, Math.max(0, currentZoom - 10));
    const cellMap = new Map<string, ReportPoint[]>();

    for (const r of validReports) {
      const lat = (r.latitude ?? r.lat)!;
      const lng = (r.longitude ?? r.lng)!;
      const cellX = Math.floor(lng / cellSize);
      const cellY = Math.floor(lat / cellSize);
      const key = `${cellX}:${cellY}`;

      const list = cellMap.get(key) || [];
      list.push(r);
      cellMap.set(key, list);
    }

    const groups: ClusterGroup[] = [];
    let clusterIdx = 0;

    for (const [key, cellReports] of cellMap.entries()) {
      if (cellReports.length === 1) {
        // Single report: treat as individual
        continue;
      }

      let sumLat = 0;
      let sumLng = 0;
      const bands: Array<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = [];

      for (const r of cellReports) {
        sumLat += (r.latitude ?? r.lat)!;
        sumLng += (r.longitude ?? r.lng)!;
        bands.push(getReportBand(r));
      }

      groups.push({
        id: `cluster-${key}-${clusterIdx++}`,
        lat: sumLat / cellReports.length,
        lng: sumLng / cellReports.length,
        reports: cellReports,
        highestBand: getWorstBand(bands),
      });
    }

    return groups;
  }, [validReports, currentZoom]);

  // Collect individual reports that aren't in a multi-item cluster
  const clusteredReportIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of clusters) {
      for (const r of c.reports) {
        ids.add(r.id);
      }
    }
    return ids;
  }, [clusters]);

  const individualReports = useMemo(() => {
    if (currentZoom >= 15) {
      return validReports;
    }
    return validReports.filter((r) => !clusteredReportIds.has(r.id));
  }, [validReports, clusteredReportIds, currentZoom]);

  return (
    <>
      {/* Cluster Markers */}
      {clusters.map((c) => {
        const color = BAND_COLORS[c.highestBand];
        const radius = Math.min(28, 14 + c.reports.length * 1.5);

        return (
          <CircleMarker
            key={c.id}
            center={[c.lat, c.lng]}
            radius={radius}
            pathOptions={{
              color,
              weight: 2,
              fillColor: BAND_BG[c.highestBand],
              fillOpacity: 0.85,
            }}
            eventHandlers={{
              click: () => {
                map.setView([c.lat, c.lng], Math.min(18, currentZoom + 2));
              },
            }}
          >
            <Popup>
              <div className="p-1 min-w-[140px] text-xs">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Cluster ({c.reports.length} issues)</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] text-white font-mono"
                    style={{ backgroundColor: color }}
                  >
                    {c.highestBand}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click cluster on map to zoom in and view individual reports.
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Individual Issue Markers */}
      {individualReports.map((r) => {
        const lat = (r.latitude ?? r.lat)!;
        const lng = (r.longitude ?? r.lng)!;
        const band = getReportBand(r);
        const color = BAND_COLORS[band];

        const p = r.priorityScore ?? r.priority ?? 0;
        const priorityScore100 = Math.round(p <= 1.0 && p > 0 ? p * 100 : p);

        const createdAt =
          typeof r.createdAt === "string"
            ? new Date(r.createdAt).getTime()
            : r.createdAt instanceof Date
            ? r.createdAt.getTime()
            : null;
        const isNew = createdAt != null && nowMs - createdAt < 3600 * 1000;

        return (
          <CircleMarker
            key={r.id}
            center={[lat, lng]}
            radius={isNew ? 9 : 7}
            pathOptions={{
              color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.75,
            }}
          >
            <Popup>
              <div className="p-1 min-w-[160px] text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-slate-900 font-bold truncate">
                    {r.title || r.category}
                  </strong>
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white uppercase shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {band} ({priorityScore100})
                  </span>
                </div>

                <div className="text-[11px] text-slate-500">
                  <span>Category: {r.category}</span>
                  {r.address && <p className="truncate mt-0.5">{r.address}</p>}
                </div>

                <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Status: {r.status}
                  </span>
                  <Link
                    href={`/issue/${r.id}`}
                    className="text-[10px] text-cyan-600 hover:text-cyan-800 font-bold underline"
                  >
                    View Details →
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
