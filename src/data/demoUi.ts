import type React from "react";

/**
 * The demo's React pieces, registered by src/demo once it has loaded (before the app
 * renders), so the shell can use them without importing demo code statically.
 */
export interface DemoUi {
  AuthProvider: React.FC<{ children: React.ReactNode }>;
  Banner: React.FC;
}

let demoUi: DemoUi | null = null;

export function registerDemoUi(ui: DemoUi | null): void {
  demoUi = ui;
}

export function getDemoUi(): DemoUi | null {
  return demoUi;
}
