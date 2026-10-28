/**
 * CivicPulse — Priority Index and Routing configuration
 * Tunable weights, constants, and seasonal matrices.
 * Defined in docs/plan/PLAN.md Appendix A.
 */

export const PRIORITY_CONFIG = {
  weights: {
    severity: 0.30,
    exposure: 0.20,
    vulnerability: 0.15,
    usability: 0.20,
    persistence: 0.15,
  },
  bands: {
    critical: 70,
    high: 50,
    medium: 30,
  },
  defaultSlaHours: 72,
  ageFloorSlaMultiplier: 2,
  ageFloorMinPi: 60,

  severity: {
    base: {
      POTHOLES: 0.6,
      DRAINAGE: 0.7,
      DRAINAGE_OPEN: 0.9,
      WATERLOGGING: 0.7,
      STREETLIGHTS: 0.5,
      SIDEWALKS: 0.5,
      FOOTPATH: 0.5,
      TRAFFIC_SIGNS: 0.6,
      TRAFFIC_SIGNS_SIGNAL_DOWN: 0.9,
      ROAD_CUT: 0.6,
      TREE_FALL: 0.6,
      TREE_FALL_BLOCKING_LANE: 0.9,
      TRASH: 0.3,
      GRAFFITI: 0.1,
      OTHER: 0.4,
    } as Record<string, number>,
    size: {
      small: 0.7,
      medium: 1.0,
      large: 1.3,
      unknown: 1.0,
    } as Record<string, number>,
    position: {
      wheel_path: 1.2,
      default: 1.0,
    } as Record<string, number>,
  },

  exposure: {
    laneVolume: {
      trunk: 1800,
      primary: 1200,
      secondary: 800,
      tertiary: 500,
      residential: 150,
      service: 80,
      footway: 0,
      default: 150,
    } as Record<string, number>,
    defaultLanes: {
      trunk: 3,
      primary: 3,
      secondary: 2,
      tertiary: 2,
      default: 1,
    } as Record<string, number>,
    defaultCongestionR: 0.3,
    busFactor: 40,
    pedestrians: {
      school: 300,
      market: 300,
      hospital: 200,
      bus_stop: 100,
      cap: 1000,
    },
    qMax: 12000,
  },

  vulnerability: {
    road: {
      trunk: 0.6,
      primary: 0.6,
      secondary: 0.7,
      tertiary: 0.7,
      residential: 0.8,
      service: 0.8,
      footway: 0.9,
      default: 0.7,
    } as Record<string, number>,
    poi: {
      school_or_hospital_200m: 0.9,
      bus_stop_50m: 0.7,
      default: 0.0,
    },
    darkStreetlightBoost: 0.2,
  },

  usability: {
    blocked: {
      none: 0.1,
      part_lane: 0.3,
      one_lane: 0.6,
      full: 1.0,
      default: 0.1,
    } as Record<string, number>,
    defaultAccess: 0.3,
    soleAccessMin: 0.8,
  },

  persistence: {
    ageFactor: 0.6,
    recurrenceFactor: 0.2,
  },

  confidence: {
    base: 0.5,
    maxAdditional: 0.5,
    divisor: 3,
    discountedWeight: 0.5,
  },

  season: {
    maxMultiplier: 1.8,
    rainMultiplier: 1.2,
    rainThresholdMm: 20,
    eventMultiplier: 1.1,
    waterSensitiveCategories: new Set([
      "DRAINAGE",
      "WATERLOGGING",
      "POTHOLES",
      "ROAD_CUT",
      "TREE_FALL",
    ]),
  },

  seasonMatrix: {
    DRAINAGE: { summer: 1.3, sw_monsoon: 1.6, ne_monsoon: 1.5, winter: 0.9 },
    WATERLOGGING: { summer: 1.0, sw_monsoon: 1.6, ne_monsoon: 1.5, winter: 0.8 },
    POTHOLES: { summer: 1.0, sw_monsoon: 1.4, ne_monsoon: 1.3, winter: 1.0 },
    ROAD_CUT: { summer: 1.0, sw_monsoon: 1.4, ne_monsoon: 1.3, winter: 1.0 },
    TREE_FALL: { summer: 1.2, sw_monsoon: 1.5, ne_monsoon: 1.3, winter: 0.9 },
    STREETLIGHTS: { summer: 1.0, sw_monsoon: 1.2, ne_monsoon: 1.2, winter: 1.1 },
    TRASH: { summer: 1.3, sw_monsoon: 1.3, ne_monsoon: 1.2, winter: 1.0 },
    SIDEWALKS: { summer: 1.1, sw_monsoon: 1.2, ne_monsoon: 1.1, winter: 1.0 },
    FOOTPATH: { summer: 1.1, sw_monsoon: 1.2, ne_monsoon: 1.1, winter: 1.0 },
    TRAFFIC_SIGNS: { summer: 1.0, sw_monsoon: 1.1, ne_monsoon: 1.1, winter: 1.0 },
    GRAFFITI: { summer: 1.0, sw_monsoon: 1.0, ne_monsoon: 1.0, winter: 1.0 },
    OTHER: { summer: 1.0, sw_monsoon: 1.0, ne_monsoon: 1.0, winter: 1.0 },
  } as Record<string, Record<"summer" | "sw_monsoon" | "ne_monsoon" | "winter", number>>,
};

export type PriorityConfig = typeof PRIORITY_CONFIG;
