// @vitest-environment node
//
// Runs the Phase 1 security migration over data shaped like production (profiles with an
// editable role + business_name, credits with timestamptz due dates) to prove the
// backfill keeps every business, member and record. Since the production history
// (*_remote.sql) is in the repo, the pre-upgrade database matches production.
import { describe, expect, it } from "vitest";
import { asUser, createDb, migrateFrom, rows } from "./harness";

const PHASE1 = "20261003120000";

describe("upgrade from the legacy schema", () => {
  it("backfills businesses, roles and sale costs without losing data", async () => {
    const db = await createDb({ before: PHASE1 });
    const legacySignUp = (email: string, meta: Record<string, unknown>) =>
      rows<{ id: string }>(db, "INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id", [
        email,
        JSON.stringify(meta),
      ]);

    const [owner] = await legacySignUp("a@shop.test", { business_name: "Mama Mboga", first_name: "A", role: "admin" });
    const [{ business_id }] = await rows<{ business_id: string }>(
      db,
      "SELECT business_id FROM profiles WHERE user_id = $1",
      [owner.id],
    );
    // A staff member created the old way (client signUp passing business_id + role).
    await legacySignUp("b@shop.test", { business_name: "Mama Mboga", business_id, role: "user", first_name: "B" });
    // A second business whose only member ended up as 'user', with a clashing name.
    await legacySignUp("c@other.test", { business_name: "mama mboga", role: "user" });

    const [{ id: productId }] = await rows<{ id: string }>(
      db,
      "INSERT INTO products (business_id, name, description, stock_quantity, buying_price) VALUES ($1, 'Sukuma', '', 10, 20) RETURNING id",
      [business_id],
    );
    const [{ id: saleId }] = await rows<{ id: string }>(
      db,
      "INSERT INTO sales (business_id, product_id, quantity, selling_price, payment_method) VALUES ($1, $2, 2, 30, 'credit') RETURNING id",
      [business_id, productId],
    );
    // Due 5 Oct in Nairobi, stored by the old UI as local midnight converted to UTC.
    await db.query(
      "INSERT INTO credits (business_id, sale_id, customer_name, amount_owed, due_date) VALUES ($1, $2, 'Otieno', 60, '2026-10-04T21:00:00Z')",
      [business_id, saleId],
    );

    await migrateFrom(db, PHASE1);

    const businesses = await rows<{ name: string }>(db, "SELECT name FROM businesses");
    expect(businesses.map((b) => b.name).sort()).toEqual(["Mama Mboga", "mama mboga (2)"]);

    const roles = await rows<{ email: string; role: string }>(
      db,
      "SELECT p.email, ur.role::text AS role FROM user_roles ur JOIN profiles p USING (user_id, business_id) ORDER BY p.email",
    );
    expect(roles).toEqual([
      { email: "a@shop.test", role: "admin" },
      { email: "b@shop.test", role: "user" },
      { email: "c@other.test", role: "admin" }, // promoted: every business needs an admin
    ]);

    const [sale] = await rows<{ unit_cost: string }>(db, "SELECT unit_cost FROM sales");
    expect(Number(sale.unit_cost)).toBe(20);
    const [credit] = await rows<{ due: string }>(db, "SELECT due_date::text AS due FROM credits");
    expect(credit.due).toBe("2026-10-05");
    const [{ n }] = await rows<{ n: number }>(db, "SELECT count(*)::int AS n FROM products");
    expect(n).toBe(1);

    // Credit names become customer records, linked from the credit and its sale.
    const [linked] = await rows<{ customer: string; sale_customer: string | null; credit_customer: string | null }>(
      db,
      `SELECT cu.name AS customer, s.customer_id::text AS sale_customer, c.customer_id::text AS credit_customer
       FROM credits c JOIN customers cu ON cu.id = c.customer_id JOIN sales s ON s.id = c.sale_id`,
    );
    expect(linked.customer).toBe("Otieno");
    expect(linked.sale_customer).toBe(linked.credit_customer);
  }, 60_000);

  it("keeps production's earlier tables as *_legacy and carries their data across", async () => {
    // The 2025 *_remote.sql migrations (production's history) already created user_roles,
    // customers, credit_payments, expenses and notifications with other shapes.
    const db = await createDb({ before: PHASE1 });
    const [owner] = await rows<{ id: string }>(
      db,
      "INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('a@shop.test', $1) RETURNING id",
      [JSON.stringify({ business_name: "Mama Mboga", first_name: "A", role: "admin" })],
    );
    const [{ business_id }] = await rows<{ business_id: string }>(db, "SELECT business_id FROM profiles WHERE user_id = $1", [owner.id]);
    await db.query("INSERT INTO user_roles (user_id, business_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING", [
      owner.id,
      business_id,
    ]);
    await db.query(
      `INSERT INTO expenses (business_id, user_id, amount, category, description, expense_date, created_by)
       VALUES ($1, $2, 1500, 'Rent', 'October', '2026-10-01T09:00:00Z', $2), ($1, $2, 0, 'Bad', NULL, now(), NULL)`,
      [business_id, owner.id],
    );
    const [{ id: customerId }] = await rows<{ id: string }>(
      db,
      "INSERT INTO customers (business_id, name, phone, notes) VALUES ($1, 'Otieno', '0712 345 678', 'Pays Fridays') RETURNING id",
      [business_id],
    );
    const [{ id: productId }] = await rows<{ id: string }>(
      db,
      "INSERT INTO products (business_id, name, description, stock_quantity, buying_price) VALUES ($1, 'Sukuma', '', 10, 20) RETURNING id",
      [business_id],
    );
    const [{ id: saleId }] = await rows<{ id: string }>(
      db,
      "INSERT INTO sales (business_id, product_id, quantity, selling_price, payment_method) VALUES ($1, $2, 2, 30, 'credit') RETURNING id",
      [business_id, productId],
    );
    await db.query(
      "INSERT INTO credits (business_id, sale_id, customer_name, customer_id, amount_owed, due_date) VALUES ($1, $2, 'Otieno', $3, 60, now())",
      [business_id, saleId, customerId],
    );

    await migrateFrom(db, PHASE1);

    const legacy = await rows<{ t: string }>(
      db,
      "SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%\\_legacy' ORDER BY 1",
    );
    expect(legacy.map((r) => r.t)).toEqual([
      "credit_payments_legacy",
      "customers_legacy",
      "expenses_legacy",
      "notifications_legacy",
      "user_roles_legacy",
    ]);

    // The relationships sign-in embeds: profiles -> businesses and profiles -> user_roles.
    const fks = await rows<{ conname: string }>(
      db,
      "SELECT conname FROM pg_constraint WHERE conname IN ('profiles_business_id_fkey', 'user_roles_profile_fkey') ORDER BY 1",
    );
    expect(fks.map((r) => r.conname)).toEqual(["profiles_business_id_fkey", "user_roles_profile_fkey"]);

    const account = await asUser(db, owner.id, () =>
      rows<{ business: string; role: string }>(
        db,
        `SELECT b.name AS business, ur.role::text AS role FROM profiles p
         JOIN businesses b ON b.id = p.business_id JOIN user_roles ur USING (user_id, business_id)`,
      ),
    );
    expect(account).toEqual([{ business: "Mama Mboga", role: "admin" }]);

    // Valid expenses are carried over; the rest stay in expenses_legacy.
    const expenses = await asUser(db, owner.id, () =>
      rows<{ category: string; amount: string; expense_date: string }>(
        db,
        "SELECT category, amount::text AS amount, expense_date::text AS expense_date FROM expenses",
      ),
    );
    expect(expenses).toEqual([{ category: "Rent", amount: "1500.00", expense_date: "2026-10-01" }]);

    // Customers keep their id (so credit links survive) and get a canonical phone.
    const customers = await asUser(db, owner.id, () =>
      rows<{ id: string; name: string; phone: string; notes: string }>(db, "SELECT id, name, phone, notes FROM customers_secure()"),
    );
    expect(customers).toEqual([{ id: customerId, name: "Otieno", phone: "+254712345678", notes: "Pays Fridays" }]);
    const [credit] = await rows<{ customer_id: string }>(db, "SELECT customer_id FROM credits");
    expect(credit.customer_id).toBe(customerId);

    // Clients lose access to the old tables (and their old policies).
    const [access] = await rows<{ anon: boolean; authed: boolean }>(
      db,
      "SELECT has_table_privilege('anon', 'public.user_roles_legacy', 'SELECT') AS anon, has_table_privilege('authenticated', 'public.user_roles_legacy', 'SELECT') AS authed",
    );
    expect(access).toEqual({ anon: false, authed: false });
  }, 60_000);
});
