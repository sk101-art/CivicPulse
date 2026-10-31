/** Text limits shared by forms (maxLength + counters) and API schemas. */
export const TEXT_LIMITS = {
  /** Report description / note entered by a citizen. */
  description: 1000,
  /** Optional report title. */
  title: 120,
  /** Free-text address supplied by a client. */
  address: 300,
  /** Desk action notes and verification notes. */
  actionNote: 1000,
  /** Comments on an issue. */
  comment: 500,
} as const;

/** Bengaluru service area accepted for evidence (matches PILOT_BOUNDS). */
export const SERVICE_AREA_MESSAGE = "CivicPulse currently covers Bengaluru. Reports from outside the city can't be filed yet.";
