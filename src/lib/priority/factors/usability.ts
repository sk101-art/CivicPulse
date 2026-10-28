import { PriorityConfig } from "@/config/priority";

export interface UsabilityInputs {
  blockedShare?: string | null;
  detourTimeSeconds?: number | null;
  normalTimeSeconds?: number | null;
  accessOverride?: number | null;
  soleAccess?: boolean;
}

export function computeUsability(
  inputs: UsabilityInputs,
  config: PriorityConfig
): { u: number; access: number; blockedMultiplier: number; missing: string[] } {
  const missing: string[] = [];

  let blockedMultiplier = config.usability.blocked.default;
  if (inputs.blockedShare) {
    const key = inputs.blockedShare.toLowerCase().replace(/[\s-]+/g, "_");
    blockedMultiplier =
      config.usability.blocked[key] ?? config.usability.blocked.default ?? 0.1;
  } else {
    missing.push("blockedShare");
  }

  let access = config.usability.defaultAccess;
  if (inputs.accessOverride !== undefined && inputs.accessOverride !== null) {
    access = inputs.accessOverride;
  } else if (
    inputs.detourTimeSeconds !== undefined &&
    inputs.detourTimeSeconds !== null &&
    inputs.normalTimeSeconds !== undefined &&
    inputs.normalTimeSeconds !== null &&
    inputs.normalTimeSeconds > 0
  ) {
    const ratio = inputs.detourTimeSeconds / inputs.normalTimeSeconds - 1;
    access = Math.max(0, Math.min(1, ratio / 0.5));
  } else {
    missing.push("routingAccessData");
  }

  if (inputs.soleAccess) {
    access = Math.max(access, config.usability.soleAccessMin);
  }

  const u = blockedMultiplier * (0.5 + 0.5 * access);

  return {
    u: Math.round(u * 1000) / 1000,
    access: Math.round(access * 1000) / 1000,
    blockedMultiplier,
    missing,
  };
}
