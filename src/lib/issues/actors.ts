import { publicDisplayName } from "@/lib/citizen/statsPure";

/** Seeded desk accounts have fixed public names; their login emails are never shown. */
const KNOWN_DESKS: Record<string, string> = {
  "desk-a@civicpulse.local": "Desk A",
  "desk-b@civicpulse.local": "Desk B",
};

export interface ActorRecord {
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

/** Public label for a desk officer: display name only, never an email address. */
export function deskDisplayName(user: ActorRecord | null | undefined): string {
  if (!user) return "Desk Officer";
  const known = user.email ? KNOWN_DESKS[user.email.toLowerCase()] : undefined;
  if (known) return known;
  const name = (user.name ?? "").trim();
  if (name && !name.includes("@")) return name;
  return "Desk Officer";
}

/** Public label for anyone in an issue's action log. */
export function actorDisplayName(actorId: string, user: ActorRecord | null | undefined): string {
  if (actorId === "system" || actorId === "SYSTEM") return "System";
  if (!user) return "Citizen";
  if (user.role === "AUTHORITY") return deskDisplayName(user);
  return publicDisplayName(user.name);
}
