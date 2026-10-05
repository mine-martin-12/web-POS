/**
 * Running the real Supabase migrations inside PGlite, shared by the database tests
 * (supabase/tests/harness.ts, Node) and the demo (src/demo, browser). Nothing here touches
 * the filesystem or the network: callers pass the SQL in.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";

/** A PGlite database or an open transaction on one. */
export type Queryable = Pick<PGlite | Transaction, "query" | "exec">;

export interface MigrationFile {
  name: string;
  sql: string;
}

/** Migrations before this prefix were written by hand without a local stack; a few of
 * them fail on a clean database (and failed in production too), so they are applied
 * best-effort, each in its own transaction, exactly like `supabase db push` would. */
export const STRICT_FROM = "2026";

export async function applyMigrations(db: Pick<PGlite, "exec">, files: MigrationFile[]): Promise<void> {
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      await db.exec(`BEGIN;\n${file.sql}\n;COMMIT;`);
    } catch (error) {
      await db.exec("ROLLBACK;");
      if (file.name >= STRICT_FROM) {
        throw new Error(`Migration ${file.name} failed: ${(error as Error).message}`);
      }
    }
  }
}

export async function rows<T = Record<string, unknown>>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Simulate Supabase Auth creating a user (fires the on_auth_user_created trigger). */
export async function signUp(db: Queryable, email: string, meta: Record<string, unknown>): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(
    db,
    `INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id`,
    [email, JSON.stringify(meta)],
  );
  return id;
}

export interface BusinessFixture {
  businessId: string;
  adminId: string;
}

/** Self-service sign-up of a new business; the signer becomes its admin. */
export async function createBusiness(
  db: Queryable,
  name: string,
  email: string,
  person: { first_name: string; last_name: string } = { first_name: "Admin", last_name: name },
): Promise<BusinessFixture> {
  const adminId = await signUp(db, email, { business_name: name, ...person });
  const [{ business_id }] = await rows<{ business_id: string }>(
    db,
    "SELECT business_id FROM public.profiles WHERE user_id = $1",
    [adminId],
  );
  return { businessId: business_id, adminId };
}

/** Admin invites a member (as the invite-staff edge function would) and they accept it. */
export async function inviteMember(
  db: Queryable,
  businessId: string,
  email: string,
  role: "admin" | "user" = "user",
  person: { first_name: string; last_name: string } = { first_name: "Staff", last_name: email },
): Promise<string> {
  const [{ token }] = await rows<{ token: string }>(
    db,
    "INSERT INTO public.invitations (business_id, email, role) VALUES ($1, $2, $3) RETURNING token",
    [businessId, email, role],
  );
  return signUp(db, email, { invite_token: token, ...person });
}
