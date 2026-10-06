/**
 * Open the demo database: the Supabase shim plus every real migration, applied in PGlite.
 * It always runs in memory; src/demo/snapshots.ts keeps a copy across reloads.
 */
import { PGlite } from "@electric-sql/pglite";
import shimSql from "../../../supabase/tests/supabase-shim.sql?raw";
import { applyMigrations, type MigrationFile } from "./core";
import { POSTGREST_PARSERS, type DemoMembers } from "./engine";

const MIGRATIONS = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function migrationFiles(): MigrationFile[] {
  return Object.entries(MIGRATIONS).map(([path, sql]) => ({ name: path.split("/").pop() as string, sql }));
}

export interface OpenedDatabase {
  db: PGlite;
  /** Set once the database has been seeded (absent for a brand-new database). */
  members: DemoMembers | null;
}

export interface OpenOptions {
  /** Start from a snapshot (see dumpDatabase) instead of an empty database. */
  from?: Blob | File;
}

/** Open the demo database in memory: from a snapshot, or new with every migration applied. */
export async function openDatabase(options: OpenOptions = {}): Promise<OpenedDatabase> {
  // One options object: PGlite ignores the second argument when the first isn't a string.
  const db = new PGlite({ loadDataDir: options.from, parsers: POSTGREST_PARSERS });
  await db.waitReady;
  // Timestamps come back in UTC, like PostgREST's.
  await db.exec("SET TIME ZONE 'UTC'");

  const [{ ready }] = (await db.query<{ ready: boolean }>("SELECT to_regclass('demo.meta') IS NOT NULL AS ready")).rows;
  if (ready) {
    const meta = await db.query<{ value: DemoMembers }>("SELECT value FROM demo.meta WHERE key = 'members'");
    if (meta.rows[0]) return { db, members: meta.rows[0].value };
    // Created but never seeded (the tab closed mid-way): start again from scratch.
    await db.close();
    throw new Error("The demo database is incomplete");
  }

  await db.exec(shimSql);
  await applyMigrations(db, migrationFiles());
  // Demo bookkeeping lives outside the app's schema and is invisible to clients.
  await db.exec("CREATE SCHEMA demo; CREATE TABLE demo.meta (key text PRIMARY KEY, value jsonb NOT NULL);");
  return { db, members: null };
}

export async function saveMembers(db: PGlite, members: DemoMembers): Promise<void> {
  await db.query(
    "INSERT INTO demo.meta (key, value) VALUES ('members', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(members)],
  );
}

/** The whole database as one compressed blob (a snapshot to reopen later). */
export async function dumpDatabase(db: PGlite): Promise<Blob | File> {
  return db.dumpDataDir("gzip");
}
