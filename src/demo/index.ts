/**
 * Demo mode entry point. Only ever loaded with import("@/demo") (see src/main.tsx), so
 * PGlite, the migrations and the seed stay out of the normal app's bundle.
 */
import { registerDemoUi } from "@/data/demoUi";
import { startDemo as openDemo } from "./session";
import { DemoAuthProvider } from "./ui/DemoAuthProvider";
import { DemoBanner } from "./ui/DemoBanner";

export { exitDemo, resetDemo } from "./session";

/** Open (or build) this tab's demo database and register the demo's UI with the shell. */
export async function startDemo(onProgress?: (fraction: number, label: string) => void): Promise<void> {
  await openDemo(onProgress);
  registerDemoUi({ AuthProvider: DemoAuthProvider, Banner: DemoBanner });
}
