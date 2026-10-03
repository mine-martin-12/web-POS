// @vitest-environment node
//
// Proves the security model at the database layer: a staff account cannot read or change
// admin-only or other-business data even with direct API calls. PostgREST runs exactly
// this kind of SQL as role `authenticated` with the caller's JWT `sub`.
import { beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asUser,
  createBusiness,
  createDb,
  createCustomerAs,
  createProduct,
  expectError,
  inviteMember,
  recordSale,
  rows,
  signUp,
  type Db,
} from "./harness";

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string; productId: string };
let other: { businessId: string; adminId: string; productId: string };

const signUpSql = "INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2)";

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme Traders", "owner@acme.test");
  const staffId = await inviteMember(db, a.businessId, "cashier@acme.test");
  acme = { ...a, staffId, productId: await createProduct(db, a.businessId) };
  const o = await createBusiness(db, "Other Shop", "owner@other.test");
  other = { ...o, productId: await createProduct(db, o.businessId, "Rival widget") };
}, 60_000);

describe("sign-up", () => {
  it("makes the signer admin of a brand-new business", async () => {
    const [role] = await rows<{ role: string }>(db, "SELECT role FROM user_roles WHERE user_id = $1", [acme.adminId]);
    expect(role.role).toBe("admin");
  });

  it("ignores forged role and business_id metadata", async () => {
    const id = await signUp(db, "attacker@evil.test", {
      business_name: "Evil Corp",
      role: "admin",
      business_id: acme.businessId,
    });
    const [profile] = await rows<{ business_id: string }>(db, "SELECT business_id FROM profiles WHERE user_id = $1", [id]);
    expect(profile.business_id).not.toBe(acme.businessId);
  });

  it("refuses sign-up without a business name or invitation", async () => {
    const msg = await expectError(db, signUpSql, ["x@x.test", JSON.stringify({ role: "admin" })]);
    expect(msg).toMatch(/business name or an invitation/);
  });

  it("refuses a duplicate business name (case-insensitive)", async () => {
    const msg = await expectError(db, signUpSql, ["dup@x.test", JSON.stringify({ business_name: " acme TRADERS " })]);
    expect(msg).toMatch(/already exists/);
  });

  it("joins staff with the invitation's role, once, only for the invited email", async () => {
    const [role] = await rows<{ role: string }>(db, "SELECT role FROM user_roles WHERE user_id = $1", [acme.staffId]);
    expect(role.role).toBe("user");

    const [{ token }] = await rows<{ token: string }>(
      db,
      "INSERT INTO invitations (business_id, email, role) VALUES ($1, 'new@acme.test', 'user') RETURNING token",
      [acme.businessId],
    );
    expect(await expectError(db, signUpSql, ["someone@else.test", JSON.stringify({ invite_token: token })])).toMatch(
      /different email/,
    );
    await signUp(db, "new@acme.test", { invite_token: token, role: "admin" });
    expect(await expectError(db, signUpSql, ["new@acme.test", JSON.stringify({ invite_token: token })])).toMatch(
      /invalid or has expired/,
    );
    const [joined] = await rows<{ role: string }>(
      db,
      "SELECT ur.role FROM user_roles ur JOIN profiles p USING (user_id) WHERE p.email = 'new@acme.test'",
    );
    expect(joined.role).toBe("user");
  });

  it("rejects expired invitations", async () => {
    const [{ token }] = await rows<{ token: string }>(
      db,
      "INSERT INTO invitations (business_id, email, expires_at) VALUES ($1, 'late@acme.test', now() - interval '1 minute') RETURNING token",
      [acme.businessId],
    );
    expect(await expectError(db, signUpSql, ["late@acme.test", JSON.stringify({ invite_token: token })])).toMatch(
      /invalid or has expired/,
    );
  });
});

describe("privilege escalation", () => {
  it("staff cannot change their own role", async () => {
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "UPDATE user_roles SET role = 'admin' WHERE user_id = $1", [acme.staffId]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("staff cannot insert an admin role", async () => {
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "INSERT INTO user_roles (user_id, business_id, role) VALUES ($1, $2, 'admin')", [
        acme.staffId,
        acme.businessId,
      ]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it.each([
    ["business_id", "business_id = (SELECT id FROM businesses LIMIT 0)"],
    ["is_active", "is_active = true"],
    ["email", "email = 'x@y.z'"],
  ])("users cannot change their own %s", async (_column, assignment) => {
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, `UPDATE profiles SET ${assignment} WHERE user_id = $1`, [acme.staffId]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("users can still edit their own name", async () => {
    await asUser(db, acme.staffId, () =>
      db.query("UPDATE profiles SET first_name = 'Jane' WHERE user_id = $1", [acme.staffId]),
    );
    const [p] = await rows<{ first_name: string }>(db, "SELECT first_name FROM profiles WHERE user_id = $1", [acme.staffId]);
    expect(p.first_name).toBe("Jane");
  });

  it("admins cannot change business rows directly (RPC only)", async () => {
    const msg = await asUser(db, acme.adminId, () =>
      expectError(db, "UPDATE businesses SET name = 'Hacked' WHERE id = $1", [acme.businessId]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("staff cannot call update_business_details", async () => {
    const msg = await asUser(db, acme.staffId, () => expectError(db, "SELECT update_business_details('New name')"));
    expect(msg).toMatch(/Admin privileges required/);
  });

  it("admins can update business details through the RPC", async () => {
    const [b] = await asUser(db, acme.adminId, () =>
      rows<{ name: string; currency: string }>(
        db,
        "SELECT name, currency FROM update_business_details('Acme Traders Ltd', '+254700000000', NULL, 'Nairobi', 'kes', 'Africa/Nairobi')",
      ),
    );
    expect(b).toEqual({ name: "Acme Traders Ltd", currency: "KES" });
  });

  it("a business always keeps an active admin", async () => {
    expect(await expectError(db, "UPDATE user_roles SET role = 'user' WHERE user_id = $1", [acme.adminId])).toMatch(
      /at least one active admin/,
    );
    expect(await expectError(db, "UPDATE profiles SET is_active = false WHERE user_id = $1", [acme.adminId])).toMatch(
      /at least one active admin/,
    );
  });
});

describe("tenant isolation", () => {
  const tables = ["businesses", "profiles", "products", "sales", "credits", "user_roles", "invitations", "credit_payments"];

  it.each(tables)("staff only ever read their own business's %s", async (table) => {
    const column = table === "businesses" ? "id" : "business_id";
    const found = await asUser(db, acme.staffId, () =>
      rows<{ b: string }>(db, `SELECT DISTINCT ${column} AS b FROM ${table}`),
    );
    expect(found.every((r) => r.b === acme.businessId)).toBe(true);
    // Guard against a vacuous pass: staff can see their own business's shared tables.
    if (["businesses", "profiles", "products", "user_roles"].includes(table)) {
      expect(found).toHaveLength(1);
    }
  });

  it.each(tables)("anonymous callers cannot read %s", async (table) => {
    const msg = await asAnon(db, () => expectError(db, `SELECT * FROM ${table}`));
    expect(msg).toMatch(/permission denied/);
  });

  it("business_id from the client is ignored on insert", async () => {
    const [p] = await asUser(db, acme.staffId, () =>
      rows<{ business_id: string; created_by: string }>(
        db,
        "INSERT INTO products (business_id, name, description) VALUES ($1, 'Sneaky', '') RETURNING business_id, created_by",
        [other.businessId],
      ),
    );
    expect(p.business_id).toBe(acme.businessId);
    expect(p.created_by).toBe(acme.staffId);
  });

  it("sales can't be inserted directly, only through record_sale()", async () => {
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "INSERT INTO sales (business_id, product_id, quantity, selling_price) VALUES ($1, $2, 1, 10)", [
        acme.businessId,
        acme.productId,
      ]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("a sale cannot reference another business's product", async () => {
    const msg = await recordSale(db, acme.staffId, other.productId).catch((e: Error) => e.message);
    expect(msg).toMatch(/Product not found/);
    const [{ stock_quantity }] = await rows<{ stock_quantity: number }>(
      db,
      "SELECT stock_quantity FROM products WHERE id = $1",
      [other.productId],
    );
    expect(stock_quantity).toBe(100);
  });

  it("negative quantities cannot be used to inflate stock", async () => {
    const msg = await recordSale(db, acme.staffId, acme.productId, { quantity: -5 }).catch((e: Error) => e.message);
    expect(msg).toMatch(/Quantity must be at least 1/);
  });

  it("selling more than the stock fails with a friendly message", async () => {
    const msg = await recordSale(db, acme.staffId, acme.productId, { quantity: 100000 }).catch((e: Error) => e.message);
    expect(msg).toMatch(/Insufficient stock for "Widget"/);
  });
});

describe("staff vs admin data access", () => {
  let staffSale: string;
  let adminSale: string;

  beforeAll(async () => {
    staffSale = await recordSale(db, acme.staffId, acme.productId, { quantity: 2, price: 80 });
    adminSale = await recordSale(db, acme.adminId, acme.productId, { quantity: 1, price: 80 });
  });

  it("staff see only the sales they recorded; admins see all", async () => {
    const staffView = await asUser(db, acme.staffId, () => rows<{ id: string }>(db, "SELECT id FROM sales"));
    expect(staffView.map((s) => s.id)).toEqual([staffSale]);
    const adminView = await asUser(db, acme.adminId, () => rows<{ id: string }>(db, "SELECT id FROM sales"));
    expect(adminView.map((s) => s.id).sort()).toEqual([staffSale, adminSale].sort());
  });

  it("staff cannot edit sales directly or through update_sale()", async () => {
    for (const id of [adminSale, staffSale]) {
      const direct = await asUser(db, acme.staffId, () =>
        expectError(db, "UPDATE sales SET selling_price = 1 WHERE id = $1", [id]),
      );
      expect(direct).toMatch(/permission denied/);
      const viaRpc = await asUser(db, acme.staffId, () =>
        expectError(db, "SELECT update_sale($1, '{\"selling_price\": 1}')", [id]),
      );
      expect(viaRpc).toMatch(/Admin privileges required/);
    }
  });

  it.each(["sales", "products", "credits"])("staff cannot delete %s", async (table) => {
    const [before] = await rows<{ n: number }>(db, `SELECT count(*)::int AS n FROM ${table}`);
    // Either refused outright (no privilege) or filtered to zero rows by RLS.
    await asUser(db, acme.staffId, () => db.query(`DELETE FROM ${table}`)).catch(() => undefined);
    const [after] = await rows<{ n: number }>(db, `SELECT count(*)::int AS n FROM ${table}`);
    expect(after.n).toBe(before.n);
  });

  it("staff cannot read invitations or other members' roles", async () => {
    const invitations = await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM invitations"));
    expect(invitations).toHaveLength(0);
    const roles = await asUser(db, acme.staffId, () => rows<{ user_id: string }>(db, "SELECT user_id FROM user_roles"));
    expect(roles.map((r) => r.user_id)).toEqual([acme.staffId]);
  });

  it("profit uses the cost at the time of sale", async () => {
    await db.query("UPDATE products SET buying_price = 999 WHERE id = $1", [acme.productId]);
    const [sale] = await rows<{ unit_cost: string }>(db, "SELECT unit_cost FROM sales WHERE id = $1", [staffSale]);
    expect(Number(sale.unit_cost)).toBe(50);
    await db.query("UPDATE products SET buying_price = 50 WHERE id = $1", [acme.productId]);
  });

  it("products with sales cannot be hard-deleted", async () => {
    const msg = await asUser(db, acme.adminId, () =>
      expectError(db, "DELETE FROM products WHERE id = $1", [acme.productId]),
    );
    expect(msg).toMatch(/foreign key/);
  });

  it("add_stock increments atomically and is tenant-scoped", async () => {
    const [p] = await asUser(db, acme.staffId, () =>
      rows<{ stock_quantity: number }>(db, "SELECT stock_quantity FROM add_stock($1, 5)", [acme.productId]),
    );
    expect(p.stock_quantity).toBeGreaterThan(0);
    const msg = await asUser(db, other.adminId, () => expectError(db, "SELECT add_stock($1, 5)", [acme.productId]));
    expect(msg).toMatch(/Product not found/);
  });
});

describe("credits", () => {
  let creditId: string;

  beforeAll(async () => {
    const customerId = await createCustomerAs(db, acme.staffId, "Wanjiku");
    const saleId = await recordSale(db, acme.staffId, acme.productId, { price: 100.1, type: "credit", customerId });
    [{ id: creditId }] = await rows<{ id: string }>(db, "SELECT id FROM credits WHERE sale_id = $1", [saleId]);
  });

  it("records payments atomically and updates status", async () => {
    await asUser(db, acme.staffId, () => db.query("SELECT record_credit_payment($1, 0.2, 'mpesa')", [creditId]));
    let [credit] = await rows<{ status: string }>(db, "SELECT status FROM credits WHERE id = $1", [creditId]);
    expect(credit.status).toBe("partially_paid");
    // Paying the exact remaining 99.90 works (JS would compute 100.1 - 0.2 = 99.8999…).
    await asUser(db, acme.staffId, () => db.query("SELECT record_credit_payment($1, 99.9)", [creditId]));
    [credit] = await rows<{ status: string }>(db, "SELECT status FROM credits WHERE id = $1", [creditId]);
    expect(credit.status).toBe("paid");
    const payments = await rows(db, "SELECT * FROM credit_payments WHERE credit_id = $1", [creditId]);
    expect(payments).toHaveLength(2);
  });

  it("rejects overpayment", async () => {
    const msg = await asUser(db, acme.staffId, () => expectError(db, "SELECT record_credit_payment($1, 1)", [creditId]));
    expect(msg).toMatch(/exceeds the outstanding balance/);
  });

  it("other businesses cannot pay off the credit", async () => {
    const msg = await asUser(db, other.adminId, () => expectError(db, "SELECT record_credit_payment($1, 1)", [creditId]));
    expect(msg).toMatch(/Credit not found/);
  });

  it("payments cannot be written directly", async () => {
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "INSERT INTO credit_payments (business_id, credit_id, amount) VALUES ($1, $2, 5)", [
        acme.businessId,
        creditId,
      ]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("a credit cannot point at another business's sale", async () => {
    const otherSale = await recordSale(db, other.adminId, other.productId, { price: 10 });
    const msg = await asUser(db, acme.staffId, () =>
      expectError(
        db,
        "INSERT INTO credits (business_id, sale_id, customer_name, amount_owed, due_date) VALUES ($1, $2, 'X', 10, '2026-10-10')",
        [acme.businessId, otherSale],
      ),
    );
    // Credits are created only by record_sale(); direct inserts are refused outright.
    expect(msg).toMatch(/permission denied/);
  });
});

describe("deactivated members", () => {
  it("see nothing and cannot write once deactivated", async () => {
    const id = await inviteMember(db, acme.businessId, "leaver@acme.test");
    await db.query("UPDATE profiles SET is_active = false WHERE user_id = $1", [id]);
    for (const table of ["products", "sales", "credits", "businesses"]) {
      const found = await asUser(db, id, () => rows(db, `SELECT * FROM ${table}`));
      expect(found).toHaveLength(0);
    }
    const msg = await asUser(db, id, () =>
      expectError(db, "INSERT INTO products (business_id, name, description) VALUES ($1, 'x', '')", [acme.businessId]),
    );
    expect(msg).toMatch(/not an active member/);
    const [p] = await rows<{ deactivated_at: string | null }>(db, "SELECT deactivated_at FROM profiles WHERE user_id = $1", [id]);
    expect(p.deactivated_at).not.toBeNull();
  });
});

describe("anonymous access", () => {
  it("can only check business name availability", async () => {
    const [{ ok }] = await asAnon(db, () =>
      rows<{ ok: boolean }>(db, "SELECT is_business_name_available('Other shop') AS ok"),
    );
    expect(ok).toBe(false);
    const msg = await asAnon(db, () => expectError(db, "SELECT get_user_business($1)", [acme.adminId]));
    expect(msg).toMatch(/permission denied/);
  });
});
