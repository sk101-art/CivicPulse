export interface ReportPoint {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  title?: string;
  status: string;
  category: string;
  priorityScore?: number | null;
  priority?: number | null;
  address?: string | null;
  createdAt?: string | Date | null;
}

export type PlacementMode = "source" | "destination" | "report" | null;

export interface RouteOption {
  coords: [number, number][];
  distance: number;
  duration: number;
  hazards: number;
  status: "safe" | "rerouted" | "warn";
  isDetour?: boolean;
  hazardCost?: number;
  routeScore?: number;
}
