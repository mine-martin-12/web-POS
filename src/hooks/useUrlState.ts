import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Read and write view state (filters, sort, page) in the URL query string, with
 * `replace` so the Back button isn't flooded and views survive reloads and can be shared.
 * Values equal to their default are removed from the URL.
 */
export function useUrlState(prefix = "") {
  const [params, setParams] = useSearchParams();

  const get = useCallback((key: string, fallback = "") => params.get(prefix + key) ?? fallback, [params, prefix]);

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>, defaults: Record<string, string> = {}) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, raw] of Object.entries(updates)) {
            const value = raw === null || raw === undefined ? "" : String(raw);
            if (value === "" || value === defaults[key]) next.delete(prefix + key);
            else next.set(prefix + key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams, prefix],
  );

  return { get, set, params };
}
