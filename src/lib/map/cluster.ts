export interface ClusterablePoint {
  id: string;
  lat: number;
  lng: number;
  priority: string;
}

export type MapClusterItem<T extends ClusterablePoint> =
  | { kind: "single"; issue: T }
  | {
      kind: "cluster";
      id: string;
      lat: number;
      lng: number;
      count: number;
      issues: T[];
      hasCritical: boolean;
    };

/**
 * Deterministic zoom-aware spatial grid clustering for Leaflet markers.
 * At zoom >= 16, all issues render individually. Below zoom 16, nearby points
 * within the zoom-scaled cell size are grouped without discarding any issues.
 */
export function clusterMapIssues<T extends ClusterablePoint>(
  issues: T[],
  zoom: number
): MapClusterItem<T>[] {
  if (issues.length === 0) return [];
  if (zoom >= 16) {
    return issues.map((issue) => ({ kind: "single", issue }));
  }

  const clampedZoom = Math.max(10, Math.min(15, zoom));
  const cellSizeDeg = 0.0009 * Math.pow(2, 15 - clampedZoom);
  const buckets = new Map<string, T[]>();

  for (const issue of issues) {
    if (!Number.isFinite(issue.lat) || !Number.isFinite(issue.lng)) continue;
    const gx = Math.floor(issue.lat / cellSizeDeg);
    const gy = Math.floor(issue.lng / cellSizeDeg);
    const key = `${gx}:${gy}`;
    const list = buckets.get(key);
    if (list) {
      list.push(issue);
    } else {
      buckets.set(key, [issue]);
    }
  }

  const result: MapClusterItem<T>[] = [];
  for (const [key, items] of buckets.entries()) {
    if (items.length === 1) {
      result.push({ kind: "single", issue: items[0] });
    } else {
      const avgLat = items.reduce((sum, it) => sum + it.lat, 0) / items.length;
      const avgLng = items.reduce((sum, it) => sum + it.lng, 0) / items.length;
      const hasCritical = items.some((it) => it.priority === "CRITICAL");
      result.push({
        kind: "cluster",
        id: `cluster-${key}`,
        lat: avgLat,
        lng: avgLng,
        count: items.length,
        issues: items,
        hasCritical,
      });
    }
  }

  return result;
}
