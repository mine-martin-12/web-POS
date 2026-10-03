/**
 * Session-safety timings, in one place. Change these numbers here only.
 */
export const SESSION_CONFIG = {
  /** Show the "are you still there?" countdown after this much inactivity. */
  warnAfterMs: 15 * 60 * 1000,
  /** Sign out automatically after this much inactivity. */
  signOutAfterMs: 20 * 60 * 1000,
  /** Persist last-activity to localStorage at most this often (keeps tabs in sync). */
  persistEveryMs: 5 * 1000,
  /** How often the countdown is re-evaluated. */
  tickMs: 1000,
  /** localStorage key shared by every open tab. */
  storageKey: "smartpos:last-activity",
  /** DOM events that count as activity. */
  activityEvents: ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"] as const,
} as const;

export const PRIVACY_STORAGE_KEY = "smartpos:privacy-mode";
