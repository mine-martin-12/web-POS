import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "migrations");

/** Migrations before this prefix were written by hand without a local stack; a few of
 * them fail on a clean database (and failed in production too), so they are applied
 * best-effort, each in its own transaction, exactly like `supabase db push` would. */
const STRICT_FROM = "2026";

export type Db = PGlite;

function migrationFiles(): string[] {
  return readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
}

/** Fresh database with migrations applied. `before` stops at the first file whose name
 * sorts at or after it (used to seed legacy data before an upgrade). */
export async function createDb(options: { before?: string } = {}): Promise<Db> {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(here, "supabase-shim.sql"), "utf8"));
  const files = migrationFiles().filter((f) => !options.before || f < options.before);
  await applyMigrations(db, files);
  return db;
}

/** Apply the remaining migrations (those at or after `from`). */
export async function migrateFrom(db: Db, from: string): Promise<void> {
  await applyMigrations(db, migrationFiles().filter((f) => f >= from));
}

async function applyMigrations(db: Db, files: string[]): Promise<void> {
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await db.exec(`BEGIN;\n${sql}\n;COMMIT;`);
    } catch (error) {
      await db.exec("ROLLBACK;");
      if (file >= STRICT_FROM) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  }
}

/** Run statements as a signed-in user (role `authenticated`, JWT sub = userId). */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function asAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE;`);
  }
}

/** Simulate Supabase Auth creating a user (fires the on_auth_user_created trigger). */
export async function signUp(
  db: Db,
  email: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id`,
    [email, JSON.stringify(meta)],
  );
  return rows[0].id;
}

export async function rows<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Resolve to the Postgres error message, or fail if the statement succeeds. */
export async function expectError(db: Db, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`Expected statement to fail: ${sql}`);
}

// ---------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------

export interface BusinessFixture {
  businessId: string;
  adminId: string;
}

/** Self-service sign-up of a new business; the signer becomes its admin. */
export async function createBusiness(db: Db, name: string, email: string): Promise<BusinessFixture> {
  const adminId = await signUp(db, email, { business_name: name, first_name: "Admin", last_name: name });
  const [{ business_id }] = await rows<{ business_id: string }>(
    db,
    "SELECT business_id FROM public.profiles WHERE user_id = $1",
    [adminId],
  );
  return { businessId: business_id, adminId };
}

/** Admin invites a member (as the invite-staff edge function would) and they accept it. */
export async function inviteMember(
  db: Db,
  businessId: string,
  email: string,
  role: "admin" | "user" = "user",
): Promise<string> {
  const [{ token }] = await rows<{ token: string }>(
    db,
    "INSERT INTO public.invitations (business_id, email, role) VALUES ($1, $2, $3) RETURNING token",
    [businessId, email, role],
  );
  return signUp(db, email, { invite_token: token, first_name: "Staff", last_name: email });
}

/** Insert a product as superuser (bypasses RLS) and return its id. */
export async function createProduct(
  db: Db,
  businessId: string,
  name = "Widget",
  stock = 100,
  buyingPrice = 50,
): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(
    db,
    `INSERT INTO public.products (business_id, name, description, stock_quantity, buying_price)
     VALUES ($1, $2, '', $3, $4) RETURNING id`,
    [businessId, name, stock, buyingPrice],
  );
  return id;
}
