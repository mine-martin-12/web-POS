/** Two-letter initials for avatars ("Jane Wanjiku" → "JW"). */
export const initials = (first?: string | null, last?: string | null) =>
  `${first?.trim().charAt(0) ?? ""}${last?.trim().charAt(0) ?? ""}`.toUpperCase() || "?";
