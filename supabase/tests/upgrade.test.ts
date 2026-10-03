// @vitest-environment node
//
// Runs the Phase 1 security migration over data shaped like production (profiles with an
// editable role + business_name, credits with timestamptz due dates) to prove the
// backfill keeps every business, member and record.
import { describe, expect, it } from "vitest";
import { createDb, migrateFrom, rows } from "./harness";

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
  }, 60_000);
});
