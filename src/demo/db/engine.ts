/**
 * The demo's database: the real migrations running in PGlite, queried the way PostgREST
 * would query them. Every app call runs in its own transaction as role `authenticated`
 * with the acting member's id, so row-level security, column grants, triggers and RPC
 * checks apply exactly as in production. PGlite runs one transaction at a time, so
 * parallel React Query calls can't interfere with each other's role.
 */
import { PGlite, types, type PGliteOptions, type Transaction } from "@electric-sql/pglite";
import { rows as queryRows } from "./core";

/** Postgres text output → the JSON PostgREST would return (numbers, ISO timestamps). */
const isoTimestamp = (value: string) => value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
export const POSTGREST_PARSERS: PGliteOptions["parsers"] = {
  [types.NUMERIC]: (value: string) => Number(value),
  [types.INT8]: (value: string) => Number(value),
  [types.TIMESTAMPTZ]: isoTimestamp,
  [types.TIMESTAMP]: (value: string) => value.replace(" ", "T"),
  [types.DATE]: (value: string) => value,
};

export interface DemoMembers {
  businessId: string;
  adminId: string;
  /** The staff member the role switcher signs in as. */
  staffId: string;
  otherStaffId: string;
}

let database: PGlite | null = null;
let members: DemoMembers | null = null;
let actorId: string | null = null;

export function installDatabase(db: PGlite | null, who: DemoMembers | null): void {
  database = db;
  members = who;
  actorId = who?.adminId ?? null;
}

export function demoDb(): PGlite {
  if (!database) throw new Error("The demo database isn't open");
  return database;
}

export function demoMembers(): DemoMembers {
  if (!members) throw new Error("The demo database isn't open");
  return members;
}

/** The member the app is currently acting as (changed by the role switcher). */
export function actor(): string {
  if (!actorId) throw new Error("The demo database isn't open");
  return actorId;
}

export function setActor(userId: string): void {
  actorId = userId;
}

/** Run as the signed-in member: what a PostgREST request with their JWT can do. */
export function asActor<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const userId = actor();
  return demoDb().transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE authenticated");
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return fn(tx);
  });
}

/** Run with the service role (bypasses RLS), as the edge functions do server-side. */
export function asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return demoDb().transaction(fn);
}

export const rows = queryRows;

/**
 * Call a database function the way PostgREST's /rpc does: named arguments, leaving out
 * the undefined ones so the function's defaults apply. `returns` mirrors what PostgREST
 * sends back: one row (composite), all rows (SETOF / TABLE) or the bare value.
 */
export async function callRpc<T>(
  tx: Transaction,
  name: string,
  args: Record<string, unknown>,
  returns: "row" | "rows" | "value",
): Promise<T> {
  const entries = Object.entries(args).filter(([, value]) => value !== undefined);
  const params = entries.map(([, value]) => (value !== null && typeof value === "object" ? JSON.stringify(value) : value));
  const call = `public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(", ")})`;
  if (returns === "value") {
    return (await queryRows<{ value: T }>(tx, `SELECT ${call} AS value`, params))[0]?.value as T;
  }
  const result = await queryRows<T>(tx, `SELECT * FROM ${call}`, params);
  return (returns === "row" ? (result[0] ?? null) : result) as T;
}

/** First row or null, like PostgREST's maybeSingle(). */
export async function maybeOne<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T | null> {
  return (await queryRows<T>(tx, sql, params))[0] ?? null;
}
