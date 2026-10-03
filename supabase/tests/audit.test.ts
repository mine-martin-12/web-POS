// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createBusiness,
  createCustomerAs,
  createDb,
  createProduct,
  expectError,
  inviteMember,
  recordSale,
  rows,
  type Db,
} from "./harness";

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string; productId: string };
let rival: { businessId: string; adminId: string };

interface Log {
  action: string;
  table_name: string;
  record_id: string;
  actor_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
}

const logsFor = (recordId: string) =>
  rows<Log>(db, "SELECT * FROM activity_logs WHERE record_id = $1 ORDER BY created_at, action", [recordId]);

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = {
    ...a,
    staffId: await inviteMember(db, a.businessId, "staff@acme.test"),
    productId: await createProduct(db, a.businessId, "Tea", 100, 30),
  };
  rival = await createBusiness(db, "Rival", "owner@rival.test");
}, 60_000);

describe("what gets logged", () => {
  it("records creates with the actor", async () => {
    const [{ id }] = await asUser(db, acme.staffId, () =>
      rows<{ id: string }>(db, "INSERT INTO products (name, description, buying_price) VALUES ('Milk', '', 55) RETURNING id"),
    );
    const [log] = await logsFor(id);
    expect(log).toMatchObject({ action: "create", table_name: "products", actor_id: acme.staffId });
    expect(log.new_values).toMatchObject({ name: "Milk", buying_price: 55 });
  });

  it("stores only the fields that changed on update", async () => {
    await asUser(db, acme.adminId, () => db.query("SELECT update_product($1, '{\"buying_price\": 32}')", [acme.productId]));
    const logs = await logsFor(acme.productId);
    const update = logs.find((l) => l.action === "update" && l.new_values && "buying_price" in l.new_values);
    expect(update?.old_values).toEqual({ buying_price: 30 });
    expect(update?.new_values).toEqual({ buying_price: 32 });
  });

  it("logs a sale, its credit and the deposit in one go", async () => {
    const customerId = await createCustomerAs(db, acme.staffId, "Chebet");
    const saleId = await recordSale(db, acme.staffId, acme.productId, {
      quantity: 2,
      price: 100,
      type: "partial",
      deposit: 50,
      customerId,
    });
    const [{ n }] = await rows<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM activity_logs
       WHERE table_name IN ('sales', 'credits', 'credit_payments') AND action = 'create' AND actor_id = $1
         AND (record_id = $2 OR new_values ->> 'sale_id' = $2::text
              OR new_values ->> 'credit_id' IN (SELECT id::text FROM credits WHERE sale_id = $2))`,
      [acme.staffId, saleId],
    );
    expect(n).toBe(3);
  });

  it("records the reason from an approved change request", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 4 });
    const [{ id }] = await asUser(db, acme.staffId, () =>
      rows<{ id: string }>(db, "SELECT id FROM submit_change('sales', $1, '{\"quantity\": 3}', 'One was damaged')", [saleId]),
    );
    await asUser(db, acme.adminId, () => db.query("SELECT review_change($1, 'approve')", [id]));
    const logs = await logsFor(saleId);
    const update = logs.find((l) => l.action === "update");
    expect(update).toMatchObject({ reason: "One was damaged", actor_id: acme.adminId, new_values: { quantity: 3 } });
  });

  it("masks phone numbers and never stores invitation tokens", async () => {
    const customerId = await createCustomerAs(db, acme.staffId, "Daudi", "0711222333");
    const [customerLog] = await logsFor(customerId);
    expect(customerLog.new_values?.phone).toBe("+2547112***33");

    const [{ id }] = await rows<{ id: string }>(
      db,
      "INSERT INTO invitations (business_id, email) VALUES ($1, 'new@acme.test') RETURNING id",
      [acme.businessId],
    );
    const [inviteLog] = await logsFor(id);
    expect(inviteLog.new_values).not.toHaveProperty("token");
    expect(inviteLog.new_values).toHaveProperty("email", "new@acme.test");
  });

  it("logs deletes with the old values", async () => {
    const saleId = await recordSale(db, acme.adminId, acme.productId);
    await asUser(db, acme.adminId, () => db.query("DELETE FROM sales WHERE id = $1", [saleId]));
    const del = (await logsFor(saleId)).find((l) => l.action === "delete");
    expect(del?.old_values).toMatchObject({ product_id: acme.productId });
  });
});

describe("who can read and write the log", () => {
  it("is readable by admins only", async () => {
    const staffView = await asUser(db, acme.staffId, () => rows(db, "SELECT id FROM activity_logs"));
    expect(staffView).toHaveLength(0);
    const adminView = await asUser(db, acme.adminId, () => rows<{ business_id: string }>(db, "SELECT business_id FROM activity_logs"));
    expect(adminView.length).toBeGreaterThan(0);
    expect(adminView.every((r) => r.business_id === acme.businessId)).toBe(true);
    const rivalView = await asUser(db, rival.adminId, () => rows<{ business_id: string }>(db, "SELECT business_id FROM activity_logs"));
    expect(rivalView.every((r) => r.business_id === rival.businessId)).toBe(true);
  });

  it.each([
    ["INSERT INTO activity_logs (business_id, action, table_name) VALUES ($1, 'create', 'sales')", [true]],
    ["UPDATE activity_logs SET reason = 'tampered'", [false]],
    ["DELETE FROM activity_logs", [false]],
  ])("refuses %s", async (sql, [needsBusiness]) => {
    for (const userId of [acme.staffId, acme.adminId]) {
      const msg = await asUser(db, userId, () => expectError(db, sql, needsBusiness ? [acme.businessId] : []));
      expect(msg).toMatch(/permission denied/);
    }
  });
});
