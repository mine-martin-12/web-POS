// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createBusiness,
  createCustomerAs,
  createDb,
  createProduct,
  inviteMember,
  recordSale,
  rows,
  type Db,
} from "./harness";

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string; otherStaffId: string; productId: string };
let rival: { businessId: string; adminId: string };

const fail = (p: Promise<unknown>) => p.then(() => "no error").catch((e: Error) => e.message);

interface Change {
  id: string;
  status: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  admin_note: string | null;
}

const submit = (userId: string, table: string, recordId: string, values: object, reason = "Customer returned one") =>
  asUser(db, userId, () =>
    rows<Change>(db, "SELECT * FROM submit_change($1, $2, $3, $4)", [table, recordId, JSON.stringify(values), reason]),
  ).then((r) => r[0]);

const review = (userId: string, id: string, decision: string, note: string | null = null) =>
  asUser(db, userId, () => rows<Change>(db, "SELECT * FROM review_change($1, $2, $3)", [id, decision, note])).then((r) => r[0]);

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = {
    ...a,
    staffId: await inviteMember(db, a.businessId, "staff@acme.test"),
    otherStaffId: await inviteMember(db, a.businessId, "staff2@acme.test"),
    productId: await createProduct(db, a.businessId, "Soap", 500, 20),
  };
  rival = await createBusiness(db, "Rival", "owner@rival.test");
}, 60_000);

describe("submitting", () => {
  it("records only the fields that change, with a snapshot of their current values", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 3, price: 50 });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 2, selling_price: 50 });
    expect(change.status).toBe("pending");
    expect(change.new_values).toEqual({ quantity: 2 });
    expect(change.old_values).toEqual({ quantity: 3 });
  });

  it("requires a reason and whitelisted fields", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId);
    expect(await fail(submit(acme.staffId, "sales", saleId, { quantity: 5 }, " "))).toMatch(/reason/);
    expect(await fail(submit(acme.staffId, "sales", saleId, { total_price: 1 }))).toMatch(/can't be changed/);
    expect(await fail(submit(acme.staffId, "sales", saleId, { quantity: 1 }))).toMatch(/Nothing changed/);
  });

  it("allows one open request per record per person", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId);
    await submit(acme.staffId, "sales", saleId, { quantity: 4 });
    expect(await fail(submit(acme.staffId, "sales", saleId, { quantity: 5 }))).toMatch(/already have an open request/);
  });

  it("staff can't ask about someone else's sale or another business's records", async () => {
    const theirs = await recordSale(db, acme.otherStaffId, acme.productId);
    expect(await fail(submit(acme.staffId, "sales", theirs, { quantity: 9 }))).toMatch(/Record not found/);
    const rivalProduct = await createProduct(db, rival.businessId);
    expect(await fail(submit(acme.staffId, "products", rivalProduct, { name: "x" }))).toMatch(/Record not found/);
  });

  it("can't be written directly", async () => {
    const msg = await fail(
      asUser(db, acme.staffId, () =>
        db.query(
          "INSERT INTO pending_updates (business_id, table_name, record_id, old_values, new_values, reason) VALUES ($1, 'products', $2, '{}', '{}', 'xxx')",
          [acme.businessId, acme.productId],
        ),
      ),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe("reviewing", () => {
  it("approving applies the change atomically, including the credit balance", async () => {
    const customerId = await createCustomerAs(db, acme.staffId, "Akinyi");
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 2, price: 100, type: "credit", customerId });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 1 });
    const reviewed = await review(acme.adminId, change.id, "approve", "OK");
    expect(reviewed.status).toBe("approved");
    const [row] = await rows<{ quantity: number; owed: string }>(
      db,
      "SELECT s.quantity, c.amount_owed AS owed FROM sales s JOIN credits c ON c.sale_id = s.id WHERE s.id = $1",
      [saleId],
    );
    expect(row).toEqual({ quantity: 1, owed: "100.00" });
  });

  it("applies product and credit changes through the same whitelist", async () => {
    const productChange = await submit(acme.staffId, "products", acme.productId, { buying_price: 25, name: "Bar soap" });
    await review(acme.adminId, productChange.id, "approve");
    const [p] = await rows<{ name: string; buying_price: string }>(db, "SELECT name, buying_price FROM products WHERE id = $1", [acme.productId]);
    expect(p).toEqual({ name: "Bar soap", buying_price: "25.00" });

    const customerId = await createCustomerAs(db, acme.staffId, "Baraka");
    const saleId = await recordSale(db, acme.staffId, acme.productId, { type: "credit", customerId });
    const [{ id: creditId }] = await rows<{ id: string }>(db, "SELECT id FROM credits WHERE sale_id = $1", [saleId]);
    const creditChange = await submit(acme.staffId, "credits", creditId, { due_date: "2099-12-31" });
    await review(acme.adminId, creditChange.id, "approve");
    const [c] = await rows<{ due: string }>(db, "SELECT due_date::text AS due FROM credits WHERE id = $1", [creditId]);
    expect(c.due).toBe("2099-12-31");
  });

  it("refuses to apply a change to a record that has moved on since", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 5 });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 4 });
    await asUser(db, acme.adminId, () => db.query("SELECT update_sale($1, '{\"quantity\": 6}')", [saleId]));
    expect(await fail(review(acme.adminId, change.id, "approve"))).toMatch(/has changed since/);
    const [{ status }] = await rows<{ status: string }>(db, "SELECT status::text FROM pending_updates WHERE id = $1", [change.id]);
    expect(status).toBe("pending");
  });

  it("send back needs feedback; the requester can edit and resubmit", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 3 });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 1 });
    expect(await fail(review(acme.adminId, change.id, "send_back"))).toMatch(/what to change/);
    const sentBack = await review(acme.adminId, change.id, "send_back", "It was 2 returned, not 2 kept");
    expect(sentBack).toMatchObject({ status: "sent_back_for_review", admin_note: "It was 2 returned, not 2 kept" });

    expect(
      await fail(asUser(db, acme.otherStaffId, () => db.query("SELECT resubmit_change($1, '{\"quantity\": 2}', 'mine')", [change.id]))),
    ).toMatch(/Request not found/);
    const [again] = await asUser(db, acme.staffId, () =>
      rows<Change>(db, "SELECT * FROM resubmit_change($1, '{\"quantity\": 2}', 'Two were returned')", [change.id]),
    );
    expect(again).toMatchObject({ status: "pending", new_values: { quantity: 2 } });
  });

  it("rejecting leaves the record alone", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 3 });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 1 });
    await review(acme.adminId, change.id, "reject", "No");
    const [{ quantity }] = await rows<{ quantity: number }>(db, "SELECT quantity FROM sales WHERE id = $1", [saleId]);
    expect(quantity).toBe(3);
    expect(await fail(review(acme.adminId, change.id, "approve"))).toMatch(/already been reviewed/);
  });

  it("only admins of the same business can review", async () => {
    const saleId = await recordSale(db, acme.staffId, acme.productId, { quantity: 3 });
    const change = await submit(acme.staffId, "sales", saleId, { quantity: 1 });
    expect(await fail(review(acme.staffId, change.id, "approve"))).toMatch(/Admin privileges required/);
    expect(await fail(review(rival.adminId, change.id, "approve"))).toMatch(/Request not found/);
  });
});

describe("visibility", () => {
  it("admins see every request, staff only their own", async () => {
    const all = await asUser(db, acme.adminId, () => rows(db, "SELECT id FROM pending_updates"));
    const mine = await asUser(db, acme.staffId, () => rows<{ requested_by: string }>(db, "SELECT requested_by FROM pending_updates"));
    const other = await asUser(db, acme.otherStaffId, () => rows(db, "SELECT id FROM pending_updates"));
    expect(mine.every((r) => r.requested_by === acme.staffId)).toBe(true);
    expect(all.length).toBe(mine.length + other.length);
    const rivalView = await asUser(db, rival.adminId, () => rows(db, "SELECT id FROM pending_updates"));
    expect(rivalView).toHaveLength(0);
  });

  it("only reviewed requests can be archived, by admins", async () => {
    const [reviewed] = await rows<{ id: string }>(db, "SELECT id FROM pending_updates WHERE status <> 'pending' LIMIT 1");
    const [archived] = await asUser(db, acme.adminId, () =>
      rows<{ archived_at: string | null }>(db, "SELECT archived_at FROM archive_change($1)", [reviewed.id]),
    );
    expect(archived.archived_at).not.toBeNull();
    expect(await fail(asUser(db, acme.staffId, () => db.query("SELECT archive_change($1)", [reviewed.id])))).toMatch(/Admin/);
  });
});
