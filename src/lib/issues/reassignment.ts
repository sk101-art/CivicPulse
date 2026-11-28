export const REASSIGNMENT_REASONS = [
  "Repair quality unsatisfactory",
  "Contractor failed to meet requirements",
  "SLA breach",
  "Insufficient repair evidence",
  "Original agency unavailable",
  "Repeated repair failure",
  "Incorrect original assignment",
  "Other",
] as const;

export type ReassignmentReason = (typeof REASSIGNMENT_REASONS)[number];
