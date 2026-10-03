import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type Density = "comfortable" | "compact";

const key = (userId: string | undefined) => `smartpos:density:${userId ?? "anon"}`;

function read(userId: string | undefined): Density {
  try {
    return localStorage.getItem(key(userId)) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

/** Table row density, remembered per signed-in user on this device. */
export function useDensity(): [Density, (d: Density) => void] {
  const { user } = useAuth();
  const [density, setState] = useState<Density>(() => read(user?.id));
  const setDensity = useCallback(
    (d: Density) => {
      setState(d);
      try {
        localStorage.setItem(key(user?.id), d);
      } catch {
        // not persisted
      }
    },
    [user?.id],
  );
  return [density, setDensity];
}
