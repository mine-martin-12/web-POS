import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations as applyMigrationFiles, rows, type MigrationFile } from "../../src/demo/db/core";

// The migration runner and the fixtures shared with the in-browser demo live in
// src/demo/db/core.ts; this file adds the Node-only parts (reading the SQL from disk).
export { createBusiness, inviteMember, rows, signUp, type BusinessFixture } from "../../src/demo/db/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "migrations");

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
  const migrations: MigrationFile[] = files.map((name) => ({ name, sql: readFileSync(path.join(migrationsDir, name), "utf8") }));
  await applyMigrationFiles(db, migrations);
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
// Fixtures (createBusiness, inviteMember and signUp come from the shared core above)
// ---------------------------------------------------------------------------------------

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

export interface SaleOptions {
  quantity?: number;
  price?: number;
  type?: "paid" | "partial" | "credit";
  method?: "cash" | "mpesa" | "bank_cheque";
  deposit?: number;
  dueDate?: string;
  customerId?: string | null;
  saleDay?: string | null;
}

/** Record a sale through record_sale() as `userId`; returns the sale id. */
export async function recordSale(db: Db, userId: string, productId: string, options: SaleOptions = {}): Promise<string> {
  const [{ id }] = await asUser(db, userId, () =>
    rows<{ id: string }>(
      db,
      `SELECT id FROM record_sale(
         _product_id => $1, _quantity => $2, _selling_price => $3, _payment_type => $4,
         _payment_method => $5, _deposit => $6, _due_date => $7, _customer_id => $8, _sale_day => $9)`,
      [
        productId,
        options.quantity ?? 1,
        options.price ?? 100,
        options.type ?? "paid",
        options.method ?? "cash",
        options.deposit ?? 0,
        options.dueDate ?? (options.type && options.type !== "paid" ? "2099-01-01" : null),
        options.customerId ?? null,
        options.saleDay ?? null,
      ],
    ),
  );
  return id;
}

/** Create a customer as `userId` (skipping duplicate prompts); returns its id. */
export async function createCustomerAs(db: Db, userId: string, name: string, phone: string | null = null): Promise<string> {
  const [{ result }] = await asUser(db, userId, () =>
    rows<{ result: { customer: { id: string } } }>(db, "SELECT create_customer($1, $2, NULL, true) AS result", [name, phone]),
  );
  return result.customer.id;
}
