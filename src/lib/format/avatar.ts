/**
 * Computes 1 or 2 letter uppercase initials from a user's name or email.
 * E.g., "Sujay" -> "S", "Ananya Das" -> "AD", "desk-a" -> "D".
 * Clean, predictable fallback for profile avatars.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 1).toUpperCase();
  }
  if (email && email.trim()) {
    const local = email.split('@')[0];
    return local.slice(0, 1).toUpperCase();
  }
  return 'C';
}
