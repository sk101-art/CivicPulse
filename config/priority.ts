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
  },
};
