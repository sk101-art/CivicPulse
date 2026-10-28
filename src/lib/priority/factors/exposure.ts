import { PriorityConfig } from "@/config/priority";

export interface ExposureInputs {
  roadClass?: string | null;
  lanes?: number | null;
  congestionR?: number | null; // r = 1 - current/freeFlow
  busesPerHour?: number | null;
  nearSchool?: boolean;
  nearMarket?: boolean;
  nearHospital?: boolean;
  nearBusStop?: boolean;
  pedestriansOverride?: number | null;
}

export function computeExposure(
  inputs: ExposureInputs,
  config: PriorityConfig
): { e: number; q: number; missing: string[] } {
  const missing: string[] = [];

  const rawClass = inputs.roadClass ? inputs.roadClass.toLowerCase() : "residential";
  if (!inputs.roadClass) {
    missing.push("roadClass");
  }

  const laneVolume =
    config.exposure.laneVolume[rawClass] ?? config.exposure.laneVolume.default ?? 150;

  let lanes = inputs.lanes;
  if (!lanes || lanes <= 0) {
    lanes = config.exposure.defaultLanes[rawClass] ?? config.exposure.defaultLanes.default ?? 1;
    if (inputs.lanes === undefined || inputs.lanes === null) {
      missing.push("lanes");
    }
  }

  const r =
    inputs.congestionR !== undefined && inputs.congestionR !== null
      ? inputs.congestionR
      : config.exposure.defaultCongestionR;

  if (inputs.congestionR === undefined || inputs.congestionR === null) {
    missing.push("congestionR");
  }

  const buses = inputs.busesPerHour ?? 0;
  if (inputs.busesPerHour === undefined || inputs.busesPerHour === null) {
    missing.push("busesPerHour");
  }

  let pedCount = 0;
  if (inputs.pedestriansOverride !== undefined && inputs.pedestriansOverride !== null) {
    pedCount = inputs.pedestriansOverride;
  } else {
    if (inputs.nearSchool) pedCount += config.exposure.pedestrians.school;
    if (inputs.nearMarket) pedCount += config.exposure.pedestrians.market;
    if (inputs.nearHospital) pedCount += config.exposure.pedestrians.hospital;
    if (inputs.nearBusStop) pedCount += config.exposure.pedestrians.bus_stop;
  }
  const pedestrians = Math.min(config.exposure.pedestrians.cap, pedCount);

  // Q = laneVolume[class] × lanes × (0.6 + 0.8 × r) × 1.2 + 40 × busesPerHour + pedestrians
  const vehicleQ = laneVolume * lanes * (0.6 + 0.8 * r) * 1.2;
  const transitQ = config.exposure.busFactor * buses;
  const Q = vehicleQ + transitQ + pedestrians;

  // E = log10(1 + Q) / log10(1 + 12000)
  const e = Math.log10(1 + Q) / Math.log10(1 + config.exposure.qMax);

  return {
    e: Math.round(e * 1000) / 1000,
    q: Math.round(Q * 10) / 10,
    missing,
  };
}
