/**
 * Builds the demo's history (every migration + ~3 months of Demo Shop trading up to
 * yesterday) and writes it as a PGlite snapshot to public/demo/history.tgz. The browser
 * loads it, shifts its dates to the current day and records today's trading, instead of
 * running ~2,000 database calls on the visitor's device.
 *
 * Run with vite-node (it resolves the @/ alias and import.meta.glob like the app):
 *   npx vite-node scripts/build-demo-snapshot.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dumpDatabase, openDatabase, saveMembers } from "../src/demo/db/boot";
import { seedHistory } from "../src/demo/seed";

export const SNAPSHOT_FILE = path.resolve("public/demo/history.tgz");

const started = Date.now();
const { db } = await openDatabase();
const members = await seedHistory(db, { seed: 20261003 });
await saveMembers(db, members);
const blob = await dumpDatabase(db);
mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
writeFileSync(SNAPSHOT_FILE, Buffer.from(await blob.arrayBuffer()));
await db.close();
console.log(`demo snapshot: ${(blob.size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s → ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
