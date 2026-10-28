import { PriorityConfig } from "@/config/priority";

export interface SeverityInputs {
  category: string;
  sizeClass?: string | null;
  lanePosition?: string | null;
  isOpenDrain?: boolean;
  isSignalDown?: boolean;
  isBlockingLane?: boolean;
}

export function computeSeverity(
  inputs: SeverityInputs,
  config: PriorityConfig
): { s: number; missing: string[] } {
  const missing: string[] = [];

  let base = config.severity.base[inputs.category];
  if (base === undefined) {
    base = config.severity.base.OTHER ?? 0.4;
    missing.push("category_base_fallback");
  }

  // Domain overrides defined in Appendix A.1
  if (inputs.category === "DRAINAGE" && inputs.isOpenDrain) {
    base = config.severity.base.DRAINAGE_OPEN ?? 0.9;
  } else if (inputs.category === "TRAFFIC_SIGNS" && inputs.isSignalDown) {
    base = config.severity.base.TRAFFIC_SIGNS_SIGNAL_DOWN ?? 0.9;
  } else if (inputs.category === "TREE_FALL" && inputs.isBlockingLane) {
    base = config.severity.base.TREE_FALL_BLOCKING_LANE ?? 0.9;
  }

  let sizeMultiplier = 1.0;
  if (inputs.sizeClass) {
    const key = inputs.sizeClass.toLowerCase();
    sizeMultiplier = config.severity.size[key] ?? 1.0;
  } else {
    missing.push("sizeClass");
  }

  let positionMultiplier = 1.0;
  if (inputs.lanePosition) {
    const normPos = inputs.lanePosition.toLowerCase().replace(/\s+/g, "_");
    if (normPos === "wheel_path") {
      positionMultiplier = config.severity.position.wheel_path ?? 1.2;
    }
  } else {
    missing.push("lanePosition");
  }

  const s = Math.min(1.0, base * sizeMultiplier * positionMultiplier);
  return {
    s: Math.round(s * 1000) / 1000,
    missing,
  };
}
