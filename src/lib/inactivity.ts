import { SESSION_CONFIG } from "@/config/session";

export type InactivityPhase = "active" | "warning" | "expired";

export interface InactivityState {
  phase: InactivityPhase;
  /** Milliseconds until automatic sign-out (0 once expired). */
  remainingMs: number;
}

/** Pure decision function: where are we given the last activity time? */
export function inactivityState(
  now: number,
  lastActivity: number,
  config: Pick<typeof SESSION_CONFIG, "warnAfterMs" | "signOutAfterMs"> = SESSION_CONFIG,
): InactivityState {
  const idle = Math.max(0, now - lastActivity);
  const remainingMs = Math.max(0, config.signOutAfterMs - idle);
  if (idle >= config.signOutAfterMs) return { phase: "expired", remainingMs: 0 };
  if (idle >= config.warnAfterMs) return { phase: "warning", remainingMs };
  return { phase: "active", remainingMs };
}

/** "4:05" style countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function readStoredActivity(storageKey = SESSION_CONFIG.storageKey): number | null {
  try {
    const raw = localStorage.getItem(storageKey);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredActivity(time: number, storageKey = SESSION_CONFIG.storageKey) {
  try {
    localStorage.setItem(storageKey, String(time));
  } catch {
    // Private mode / storage full: tabs just won't share activity.
  }
}

/** Forget the last activity (on sign-out), so it can't count against the next session. */
export function clearStoredActivity(storageKey = SESSION_CONFIG.storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Storage unavailable: nothing was stored either.
  }
}

/**
 * The stored activity that belongs to the current session, or null. A timestamp from
 * before the user's latest sign-in was left by an earlier session (e.g. one that ended
 * without signing out) and must not sign the new session out.
 */
export function sessionActivity(stored: number | null, lastSignInAt: string | null | undefined): number | null {
  if (stored === null) return null;
  const signedInAt = lastSignInAt ? Date.parse(lastSignInAt) : NaN;
  return Number.isFinite(signedInAt) && stored < signedInAt ? null : stored;
}
