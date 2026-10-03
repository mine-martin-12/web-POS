import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Runs `onTrigger` once when the URL carries `?<name>=1` (set by quick actions, the
 * command palette and the mobile action button), then removes the param so a reload
 * or Back doesn't re-open the dialog.
 */
export function useActionParam(name: string, onTrigger: () => void) {
  const [params, setParams] = useSearchParams();
  const callback = useRef(onTrigger);
  callback.current = onTrigger;

  const value = params.get(name);
  useEffect(() => {
    if (value === null) return;
    callback.current();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  }, [value, name, setParams]);
}
