// @vitest-environment node
//
// Production has no Supabase default "GRANT ALL ... TO authenticated" on the original
// tables, so the earlier migrations (which only revoked) left signed-in users unable to read
// profiles: "permission denied for table profiles" at sign-in. These tests start from that
// state and prove the explicit-grants migration restores exactly the intended access.
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createBusiness, createDb, createProduct, expectError, inviteMember, migrateFrom, recordSale, rows, type Db } from "./harness";

const GRANTS = "20261004150000";
const TABLES = ["profiles", "products", "sales", "credits"];
const SIGN_IN_QUERY = `SELECT p.id, p.user_id, p.business_id, p.email, p.first_name, p.last_name, p.is_active,
  p.deactivated_at, p.created_at, p.updated_at, b.name AS business, ur.role::text AS role
  FROM profiles p JOIN businesses b ON b.id = p.business_id JOIN user_roles ur USING (user_id, business_id)`;

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string; productId: string };

beforeAll(async () => {
  db = await createDb({ before: GRANTS });
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  const staffId = await inviteMember(db, a.businessId, "staff@acme.test");
  const productId = await createProduct(db, a.businessId);
  acme = { ...a, staffId, productId };
  await recordSale(db, staffId, productId);
  // What production looks like: no default privileges on the original tables.
  await db.exec(`REVOKE ALL ON ${TABLES.map((t) => `public.${t}`).join(", ")} FROM anon, authenticated;`);
}, 60_000);

describe("explicit table grants", () => {
  it("reproduces the production sign-in failure before the fix", async () => {
    const msg = await asUser(db, acme.adminId, () => expectError(db, SIGN_IN_QUERY));
    expect(msg).toBe("permission denied for table profiles");
  });

  it("lets members load their account after the fix", async () => {
    await migrateFrom(db, GRANTS);
    for (const [userId, role] of [
      [acme.adminId, "admin"],
      [acme.staffId, "user"],
    ]) {
      const account = await asUser(db, userId, () =>
        rows<{ business: string; role: string }>(db, `${SIGN_IN_QUERY} WHERE p.user_id = $1`, [userId]),
      );
      expect(account.map((r) => [r.business, r.role])).toEqual([["Acme", role]]);
    }
  });

  it("grants exactly the intended privileges", async () => {
    const grants = await rows<{ table_name: string; p: string }>(
      db,
      `SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS p
       FROM information_schema.role_table_grants
       WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = ANY($1)
       GROUP BY 1 ORDER BY 1`,
      [TABLES],
    );
    expect(grants).toEqual([
      { table_name: "credits", p: "SELECT" },
      { table_name: "products", p: "DELETE,INSERT,SELECT,UPDATE" },
      { table_name: "profiles", p: "SELECT" },
      { table_name: "sales", p: "DELETE,SELECT" },
    ]);
    const anon = await rows(
      db,
      "SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = ANY($1)",
      [TABLES],
    );
    expect(anon).toEqual([]);
  });

  it("still limits writes: staff can only change their own name", async () => {
    await asUser(db, acme.staffId, () =>
      db.query("UPDATE profiles SET first_name = 'Wanjiru' WHERE user_id = $1", [acme.staffId]),
    );
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "UPDATE profiles SET is_active = false WHERE user_id = $1", [acme.staffId]),
    );
    expect(msg).toMatch(/permission denied/);
    expect(await asUser(db, acme.staffId, () => expectError(db, "TRUNCATE sales"))).toMatch(/permission denied/);
  });

  it("keeps RLS in charge of rows: staff see only their own sales", async () => {
    await recordSale(db, acme.adminId, acme.productId);
    const [{ n }] = await asUser(db, acme.staffId, () => rows<{ n: number }>(db, "SELECT count(*)::int AS n FROM sales"));
    expect(n).toBe(1);
  });
});
