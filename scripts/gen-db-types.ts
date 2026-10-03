/**
 * Regenerates src/integrations/supabase/types.ts from the migrations, without Docker or a
 * linked project: the migrations are applied to an in-memory PGlite database and the
 * public schema is introspected into the same shape `supabase gen types typescript` emits.
 *
 *   npm run db:types
 *
 * After deploying migrations you can still run the official generator; the output should
 * only differ cosmetically.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, rows } from "../supabase/tests/harness.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../src/integrations/supabase/types.ts");

interface Column {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_generated: "ALWAYS" | "NEVER";
  is_identity: "YES" | "NO";
  udt_name: string;
  data_type: string;
  ordinal_position: number;
}

const db = await createDb();

const tables = await rows<{ name: string; kind: "r" | "v" }>(
  db,
  `SELECT c.relname AS name, CASE WHEN c.relkind IN ('v','m') THEN 'v' ELSE 'r' END AS kind
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
   ORDER BY c.relname`,
);

const columns = await rows<Column>(
  db,
  `SELECT table_name, column_name, is_nullable, column_default, is_generated, is_identity,
          udt_name, data_type, ordinal_position
   FROM information_schema.columns WHERE table_schema = 'public'
   ORDER BY table_name, column_name`,
);

const enums = await rows<{ name: string; values: string[] }>(
  db,
  `SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
   FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
   JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`,
);
const enumNames = new Set(enums.map((e) => e.name));

const relationships = await rows<{
  table_name: string;
  name: string;
  columns: string[];
  ref_table: string;
  ref_columns: string[];
  one_to_one: boolean;
}>(
  db,
  `SELECT cl.relname AS table_name, con.conname AS name,
          array(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
          rcl.relname AS ref_table,
          array(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS ref_columns,
          EXISTS (
            SELECT 1 FROM pg_constraint u
            WHERE u.conrelid = con.conrelid AND u.contype IN ('p','u')
              AND (SELECT array_agg(x ORDER BY x) FROM unnest(u.conkey) x) = (SELECT array_agg(x ORDER BY x) FROM unnest(con.conkey) x)
          ) AS one_to_one
   FROM pg_constraint con
   JOIN pg_class cl ON cl.oid = con.conrelid
   JOIN pg_namespace n ON n.oid = cl.relnamespace
   JOIN pg_class rcl ON rcl.oid = con.confrelid
   JOIN pg_namespace rn ON rn.oid = rcl.relnamespace
   WHERE con.contype = 'f' AND n.nspname = 'public' AND rn.nspname = 'public'
   ORDER BY con.conname`,
);

const functions = await rows<{
  name: string;
  arg_names: string[] | null;
  arg_types: string[];
  arg_modes: string[] | null;
  num_defaults: number;
  return_type: string;
  returns_set: boolean;
  return_relation: string | null;
}>(
  db,
  `SELECT p.proname AS name, p.proargnames AS arg_names,
          array(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) t) AS arg_types,
          p.proargmodes::text[] AS arg_modes,
          p.pronargdefaults AS num_defaults,
          format_type(p.prorettype, NULL) AS return_type,
          p.proretset AS returns_set,
          (SELECT c.relname FROM pg_class c WHERE c.reltype = p.prorettype) AS return_relation
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
   ORDER BY p.proname`,
);

function tsType(pgType: string): string {
  const t = pgType.replace(/^public\./, "").replace(/^_/, "");
  const isArray = pgType.startsWith("_") || pgType.endsWith("[]");
  const base = t.replace(/\[\]$/, "");
  let ts: string;
  if (enumNames.has(base)) ts = `Database["public"]["Enums"]["${base}"]`;
  else if (["int2", "int4", "int8", "float4", "float8", "numeric", "integer", "smallint", "bigint", "real", "double precision"].includes(base)) ts = "number";
  else if (["bool", "boolean"].includes(base)) ts = "boolean";
  else if (["json", "jsonb"].includes(base)) ts = "Json";
  else if (base === "void") ts = "undefined";
  else ts = "string";
  return isArray ? `${ts}[]` : ts;
}

const I = (n: number) => "  ".repeat(n);
const out: string[] = [];

out.push(`export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {`);

function emitRelation(name: string, kind: "r" | "v") {
  const cols = columns.filter((c) => c.table_name === name).sort((a, b) => a.column_name.localeCompare(b.column_name));
  const row = (c: Column) => `${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""}`;
  out.push(`${I(3)}${name}: {`);
  out.push(`${I(4)}Row: {`);
  for (const c of cols) out.push(`${I(5)}${c.column_name}: ${row(c)}`);
  out.push(`${I(4)}}`);
  if (kind === "r") {
    out.push(`${I(4)}Insert: {`);
    for (const c of cols) {
      if (c.is_generated === "ALWAYS") {
        out.push(`${I(5)}${c.column_name}?: never`);
        continue;
      }
      const optional = c.is_nullable === "YES" || c.column_default !== null || c.is_identity === "YES";
      out.push(`${I(5)}${c.column_name}${optional ? "?" : ""}: ${row(c)}`);
    }
    out.push(`${I(4)}}`);
    out.push(`${I(4)}Update: {`);
    for (const c of cols) {
      out.push(`${I(5)}${c.column_name}?: ${c.is_generated === "ALWAYS" ? "never" : row(c)}`);
    }
    out.push(`${I(4)}}`);
  }
  const rels = relationships.filter((r) => r.table_name === name);
  if (rels.length === 0) {
    out.push(`${I(4)}Relationships: []`);
  } else {
    out.push(`${I(4)}Relationships: [`);
    for (const r of rels) {
      out.push(`${I(5)}{`);
      out.push(`${I(6)}foreignKeyName: "${r.name}"`);
      out.push(`${I(6)}columns: [${r.columns.map((c) => `"${c}"`).join(", ")}]`);
      out.push(`${I(6)}isOneToOne: ${r.one_to_one}`);
      out.push(`${I(6)}referencedRelation: "${r.ref_table}"`);
      out.push(`${I(6)}referencedColumns: [${r.ref_columns.map((c) => `"${c}"`).join(", ")}]`);
      out.push(`${I(5)}},`);
    }
    out.push(`${I(4)}]`);
  }
  out.push(`${I(3)}}`);
}

out.push(`${I(2)}Tables: {`);
for (const t of tables.filter((t) => t.kind === "r")) emitRelation(t.name, "r");
out.push(`${I(2)}}`);

const views = tables.filter((t) => t.kind === "v");
out.push(`${I(2)}Views: {`);
if (views.length === 0) out.push(`${I(3)}[_ in never]: never`);
for (const v of views) emitRelation(v.name, "v");
out.push(`${I(2)}}`);

out.push(`${I(2)}Functions: {`);
if (functions.length === 0) out.push(`${I(3)}[_ in never]: never`);
for (const f of functions) {
  const inputs = f.arg_types
    .map((type, i) => ({ type, name: f.arg_names?.[i] ?? `arg${i}`, mode: f.arg_modes?.[i] ?? "i" }))
    .filter((a) => a.mode === "i" || a.mode === "b");
  const firstDefault = inputs.length - f.num_defaults;
  const args =
    inputs.length === 0
      ? "Record<PropertyKey, never>"
      : `{ ${inputs.map((a, i) => `${a.name}${i >= firstDefault ? "?" : ""}: ${tsType(a.type)}`).join("; ")} }`;
  let returns: string;
  if (f.return_relation) returns = `Database["public"]["Tables"]["${f.return_relation}"]["Row"]`;
  else returns = tsType(f.return_type.replace(/^public\./, ""));
  if (f.returns_set) returns = `${returns}[]`;
  out.push(`${I(3)}${f.name}: {`);
  out.push(`${I(4)}Args: ${args}`);
  out.push(`${I(4)}Returns: ${returns}`);
  out.push(`${I(3)}}`);
}
out.push(`${I(2)}}`);

out.push(`${I(2)}Enums: {`);
for (const e of enums) out.push(`${I(3)}${e.name}: ${e.values.map((v) => `"${v}"`).join(" | ")}`);
out.push(`${I(2)}}`);
out.push(`${I(2)}CompositeTypes: {`);
out.push(`${I(3)}[_ in never]: never`);
out.push(`${I(2)}}`);
out.push(`${I(1)}}`);
out.push(`}`);
out.push("");

// The generic helper types (Tables<>, TablesInsert<>, Enums<>…) never change.
const existing = readFileSync(outFile, "utf8");
const helpersStart = existing.indexOf("type DatabaseWithoutInternals");
const constantsStart = existing.indexOf("export const Constants");
out.push(existing.slice(helpersStart, constantsStart).trimEnd());
out.push("");
out.push("export const Constants = {");
out.push("  public: {");
out.push("    Enums: {");
for (const e of enums) out.push(`      ${e.name}: [${e.values.map((v) => `"${v}"`).join(", ")}],`);
out.push("    },");
out.push("  },");
out.push("} as const");
out.push("");

writeFileSync(outFile, out.join("\n"));
console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${tables.length} relations, ${functions.length} functions)`);
await db.close();
