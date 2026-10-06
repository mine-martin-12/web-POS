/**
 * Starting, resetting and leaving the demo. The database lives in this tab's memory only:
 * changes last for the session and are gone on reload, reset or exit ("changes aren't
 * saved"). The demo flag and the chosen role are kept in sessionStorage, so a reload stays
 * in the demo with a fresh shop.
 */
import { installDemoApi } from "@/data/routed";
import { setDemoMode } from "@/data/mode";
import { demoApi } from "./api";
import { openDatabase, saveMembers } from "./db/boot";
import { demoDb, demoMembers, installDatabase, setActor } from "./db/engine";
import { seedDemo, seedToday, shiftToToday } from "./seed";

export type DemoRole = "admin" | "staff";

const ROLE_KEY = "smartpos:demo-role";
/** Built by scripts/build-demo-snapshot.ts: the shop's history up to the build's yesterday. */
const HISTORY_URL = "/demo/history.tgz";

const session = {
  get: (key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Storage blocked: the role resets to admin on reload.
    }
  },
  remove: (key: string) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing stored.
    }
  },
};

export function currentRole(): DemoRole {
  return session.get(ROLE_KEY) === "staff" ? "staff" : "admin";
}

export function switchRole(role: DemoRole): void {
  session.set(ROLE_KEY, role);
  const who = demoMembers();
  setActor(role === "staff" ? who.staffId : who.adminId);
}

/**
 * Open the demo shop: the shipped history moved to end yesterday, plus today's trading
 * recorded now. Without a shipped history (the dev server before `npm run demo:snapshot`)
 * the whole shop is built here instead, which takes longer.
 */
export async function startDemo(onProgress: (fraction: number, label: string) => void = () => {}): Promise<void> {
  // Startup phases, visible in the browser's performance timeline.
  const mark = (name: string) => performance.mark(`demo:${name}`);
  mark("start");
  onProgress(0.1, "Opening the demo shop…");

  const history = await fetchHistory();
  let opened;
  if (history) {
    opened = await openDatabase({ from: history });
    mark("loaded");
    onProgress(0.6, "Opening today's trading…");
    await shiftToToday(opened.db);
    await seedToday(opened.db, opened.members!);
    mark("today");
  } else {
    onProgress(0.1, "Preparing the demo database…");
    opened = await openDatabase();
    mark("migrated");
    onProgress(0.35, "Stocking the shop…");
    const members = await seedDemo(opened.db, { onProgress: (p) => onProgress(0.35 + p * 0.55, "Stocking the shop…") });
    await saveMembers(opened.db, members);
    opened.members = members;
    mark("seeded");
  }

  installDatabase(opened.db, opened.members);
  switchRole(currentRole());
  installDemoApi(demoApi);
  mark("ready");
  onProgress(1, "Ready");
}

async function fetchHistory(): Promise<Blob | null> {
  try {
    const response = await fetch(HISTORY_URL);
    const type = response.headers.get("content-type") ?? "";
    // The dev server answers unknown paths with index.html.
    return response.ok && !type.includes("text/html") ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function close(): Promise<void> {
  installDemoApi(null);
  try {
    await demoDb().close();
  } catch {
    // Not open.
  }
  installDatabase(null, null);
}

/** Throw away this tab's changes; the next start (a reload) opens a fresh shop. */
export async function resetDemo(): Promise<void> {
  await close();
}

/** Leave the demo: drop its data and turn demo mode off for this tab. */
export async function exitDemo(): Promise<void> {
  await close();
  session.remove(ROLE_KEY);
  setDemoMode(false);
}
