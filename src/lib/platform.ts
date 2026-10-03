import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** True on macOS/iOS, where shortcuts use ⌘ instead of Ctrl. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Label for the primary modifier key: "⌘" on Apple devices, "Ctrl" elsewhere. */
export const modKey = isMac ? "⌘" : "Ctrl";

/** Ctrl on Windows/Linux, ⌘ on Mac. */
export function isModKey(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/** Keyboard shortcuts that are actually implemented, shown in the command palette. */
export const SHORTCUTS = {
  commandPalette: { keys: [modKey, "K"], label: `${modKey} K` },
  privacyMode: { keys: [modKey, "Shift", "H"], label: `${modKey} ⇧ H` },
  toggleSidebar: { keys: [modKey, "B"], label: `${modKey} B` },
} as const;
