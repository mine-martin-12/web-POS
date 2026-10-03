// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_HOME, APP_PAGES, LEGACY_REDIRECTS, QUICK_ACTIONS } from "./routes";
import { SHORTCUTS } from "@/lib/platform";

// The routes actually declared in App.tsx: "/app" children are written as path="x".
const appSource = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
const childPaths = [...appSource.matchAll(/path="([a-z-]+)"/g)].map((m) => `${APP_HOME}/${m[1]}`);
const declared = new Set([APP_HOME, ...childPaths]);

describe("route registry (no dead links)", () => {
  it.each(APP_PAGES.map((p) => [p.title, p.path]))("sidebar/palette page %s → %s exists", (_title, p) => {
    expect(declared.has(p)).toBe(true);
  });

  it.each(QUICK_ACTIONS.map((a) => [a.label, a.to]))("quick action %s → %s exists", (_label, to) => {
    expect(declared.has(to.split("?")[0])).toBe(true);
  });

  it.each(Object.entries(LEGACY_REDIRECTS))("legacy %s redirects to an existing page", (_from, to) => {
    expect(declared.has(to)).toBe(true);
  });

  it("every page in App.tsx is reachable from the registry", () => {
    const registered = new Set(APP_PAGES.map((p) => p.path));
    expect(childPaths.filter((p) => !registered.has(p))).toEqual([]);
  });
});

describe("shortcuts shown in the palette are implemented", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");
  it("Ctrl/⌘+K opens the palette", () => {
    expect(SHORTCUTS.commandPalette.keys.at(-1)).toBe("K");
    expect(read("components/layout/CommandPalette.tsx")).toMatch(/event\.key\.toLowerCase\(\) === "k"/);
  });
  it("Ctrl/⌘+Shift+H toggles privacy mode", () => {
    expect(read("contexts/PrivacyModeContext.tsx")).toMatch(/event\.shiftKey && event\.key\.toLowerCase\(\) === "h"/);
  });
  it("Ctrl/⌘+B toggles the sidebar", () => {
    expect(read("components/ui/sidebar.tsx")).toMatch(/SIDEBAR_KEYBOARD_SHORTCUT = "b"/);
  });
});
