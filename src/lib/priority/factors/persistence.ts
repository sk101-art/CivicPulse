import { PriorityConfig } from "@/config/priority";

export interface PersistenceInputs {
  ageHours?: number | null;
  slaHours?: number | null;
  recurrences?: number | null;
}

export function computePersistence(
  inputs: PersistenceInputs,
  config: PriorityConfig
): { p: number; missing: string[] } {
  const missing: string[] = [];

  const age = inputs.ageHours ?? 0;
  if (inputs.ageHours === undefined || inputs.ageHours === null) {
    missing.push("ageHours");
  }

  const sla = inputs.slaHours && inputs.slaHours > 0 ? inputs.slaHours : config.defaultSlaHours;
  if (!inputs.slaHours) {
    missing.push("slaHours");
  }

  const recurrences = inputs.recurrences ?? 0;
  if (inputs.recurrences === undefined || inputs.recurrences === null) {
    missing.push("recurrences");
  }

  const p = Math.min(
    1.0,
    config.persistence.ageFactor * (age / sla) +
      config.persistence.recurrenceFactor * recurrences
  );

  return {
    p: Math.round(p * 1000) / 1000,
    missing,
  };
}
