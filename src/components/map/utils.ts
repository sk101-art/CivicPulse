import L from "leaflet";

export const HAZARD_RADIUS_METERS = 15;

export function sourceIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(16,185,129,0.5);
        box-shadow:0 0 22px rgba(16,185,129,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">S</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function destIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(10,10,11,0.85);
        border:1px solid rgba(255,46,99,0.5);
        box-shadow:0 0 22px rgba(255,46,99,0.3);
        display:flex;align-items:center;justify-content:center;
        color:#FFFFFF;font-weight:900;font-family:ui-monospace, monospace;
        font-size:11px;
      ">D</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointToPolyDist(
  pt: [number, number],
  poly: [number, number][]
): number {
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const A = poly[i];
    const B = poly[i + 1];
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((pt[0] - A[0]) * dx + (pt[1] - A[1]) * dy) / lenSq));
    const d = haversineMeters(pt[0], pt[1], A[0] + t * dx, A[1] + t * dy);
    if (d < min) min = d;
  }
  return min;
}

export async function fetchAllRoutes(
  waypoints: [number, number][],
  alternatives: number | false = 3
): Promise<Array<{ coords: [number, number][]; distance: number; duration: number }>> {
  if (waypoints.length < 2) return [];

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const viaWaypoints = waypoints.slice(1, -1);

  const res = await fetch("/api/routes/safe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: { latitude: origin[0], longitude: origin[1] },
      destination: { latitude: destination[0], longitude: destination[1] },
      waypoints: viaWaypoints.map(([lat, lon]) => ({ latitude: lat, longitude: lon })),
      maxAlternatives:
        alternatives === false ? 0 : typeof alternatives === "number" ? alternatives : 2,
    }),
  });

  if (!res.ok) return [];

  const data: unknown = await res.json();
  const parsed = data as {
    routes?: Array<{
      coords?: Array<[number, number]>;
      distance?: number;
      duration?: number;
    }>;
  };

  if (!parsed.routes?.length) return [];

  return parsed.routes
    .map((r) => {
      if (
        !r.coords?.length ||
        typeof r.distance !== "number" ||
        typeof r.duration !== "number"
      ) {
        return null;
      }
      return { coords: r.coords, distance: r.distance, duration: r.duration };
    })
    .filter((x): x is { coords: [number, number][]; distance: number; duration: number } =>
      Boolean(x)
    );
}

export function buildDetourWaypoints(
  src: [number, number],
  dst: [number, number],
  routeCoords: [number, number][],
  hazards: Array<{ latitude: number; longitude: number }>,
  offsetMeters: number
): [number, number][] {
  const positioned = hazards
    .map((h) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      routeCoords.forEach((c, i) => {
        const d = haversineMeters(h.latitude, h.longitude, c[0], c[1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      return { ...h, idx: bestIdx };
    })
    .sort((a, b) => a.idx - b.idx);

  const waypoints: [number, number][] = [src];
  for (const hz of positioned) {
    const idx = hz.idx;
    const before = routeCoords[Math.max(0, idx - 10)];
    const after = routeCoords[Math.min(routeCoords.length - 1, idx + 10)];
    const dLat = after[0] - before[0];
    const dLng = after[1] - before[1];
    const len = Math.sqrt(dLat * dLat + dLng * dLng);
    if (len === 0) continue;

    const perpLat = -dLng / len;
    const perpLng = dLat / len;
    const offsetDeg = offsetMeters / 111000;

    const optA: [number, number] = [
      hz.latitude + perpLat * offsetDeg,
      hz.longitude + perpLng * offsetDeg,
    ];
    const optB: [number, number] = [
      hz.latitude - perpLat * offsetDeg,
      hz.longitude - perpLng * offsetDeg,
    ];
    const dA = haversineMeters(optA[0], optA[1], hz.latitude, hz.longitude);
    const dB = haversineMeters(optB[0], optB[1], hz.latitude, hz.longitude);
    waypoints.push(dA >= dB ? optA : optB);
  }

  waypoints.push(dst);
  return waypoints;
}

export function evaluateRouteHazards(
  coords: [number, number][],
  validReports: Array<{ latitude: number; longitude: number }>,
  hazardRadius: number = HAZARD_RADIUS_METERS
): number {
  let count = 0;
  for (const r of validReports) {
    const d = pointToPolyDist([r.latitude, r.longitude], coords);
    if (d <= hazardRadius) {
      count++;
    }
  }
  return count;
}
