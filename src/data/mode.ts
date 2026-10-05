/**
 * Demo mode: the whole app runs against an in-browser database (src/demo) and never talks
 * to Supabase. The flag lives in sessionStorage, so it belongs to this browser tab only and
 * disappears when the tab closes.
 */
export const DEMO_FLAG_KEY = "smartpos:demo";
/** `?demo=1` opens the demo (shareable link). */
export const DEMO_URL_PARAM = "demo";

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DEMO_FLAG_KEY, "1");
    else sessionStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    // Storage blocked: the demo can't persist across reloads, nothing else to do.
  }
}

/** Success text for actions whose side effect (SMS, email, invitation…) is only simulated. */
export function simulatedNote(message: string): string {
  return isDemoMode() ? `${message} (simulated in demo)` : message;
}

/** Thrown when anything reaches for the real Supabase client while in demo mode. */
export class DemoLeakError extends Error {
  constructor(what: string) {
    super(`Supabase was called in demo mode (${what}). Demo mode must never reach the real backend.`);
    this.name = "DemoLeakError";
  }
}
