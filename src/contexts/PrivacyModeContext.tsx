import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PRIVACY_STORAGE_KEY } from "@/config/session";
import { isModKey } from "@/lib/platform";

interface PrivacyModeValue {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
}

const PrivacyModeContext = createContext<PrivacyModeValue | null>(null);

function readInitial(): boolean {
  try {
    return localStorage.getItem(PRIVACY_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Privacy mode blurs every amount (elements with `.sensitive`) and chart values, for using
 * the app in front of customers. It sets data-privacy="on" on <html>; the CSS lives in
 * index.css. Toggle from the header eye button, the command palette or Ctrl/⌘+Shift+H.
 */
export function PrivacyModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(readInitial);

  useEffect(() => {
    document.documentElement.dataset.privacy = enabled ? "on" : "off";
    try {
      localStorage.setItem(PRIVACY_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // Not persisted; still applied for this visit.
    }
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModKey(event) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo(() => ({ enabled, toggle, setEnabled }), [enabled, toggle]);
  return <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrivacyMode(): PrivacyModeValue {
  const context = useContext(PrivacyModeContext);
  if (!context) throw new Error("usePrivacyMode must be used within a PrivacyModeProvider");
  return context;
}
