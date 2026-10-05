import { isDemoMode } from "./mode";
import type { DataApi } from "./types";

let demoApi: DataApi | null = null;

/** Called by the demo module once its database is ready (and with null on exit). */
export function installDemoApi(api: DataApi | null): void {
  demoApi = api;
}

type AnyFn = (...args: never[]) => unknown;

/**
 * Wrap a feature's Supabase functions so each call goes to the demo implementation when
 * demo mode is on. Pages, hooks and components keep importing from the feature's api.ts
 * and never know which one answered.
 */
export function routed<K extends keyof DataApi>(feature: K, remote: DataApi[K]): DataApi[K] {
  const out: Record<string, AnyFn> = {};
  for (const [name, fn] of Object.entries(remote as Record<string, AnyFn>)) {
    out[name] = (...args: never[]) => {
      if (!isDemoMode()) return fn(...args);
      if (!demoApi) throw new Error("The demo is still loading. Please try again in a moment.");
      const demoFn = (demoApi[feature] as Record<string, AnyFn>)[name];
      return demoFn(...args);
    };
  }
  return out as DataApi[K];
}
