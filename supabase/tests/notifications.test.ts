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
let acme: { businessId: string; adminId: string; staffId: string };

const notificationsFor = (userId: string, kind?: string) =>
  rows<{ kind: string; title: string; link_table: string | null; link_id: string | null }>(
    db,
    `SELECT kind, title, link_table, link_id FROM notifications WHERE user_id = $1 ${kind ? "AND kind = $2" : ""} ORDER BY created_at`,
    kind ? [userId, kind] : [userId],
  );

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = { ...a, staffId: await inviteMember(db, a.businessId, "staff@acme.test") };
}, 60_000);

describe("notifications", () => {
  it("tells admins about a change request and the requester about the decision", async () => {
    const productId = await createProduct(db, acme.businessId, "Salt", 100, 10);
    const saleId = await recordSale(db, acme.staffId, productId, { quantity: 3 });
    const [{ id }] = await asUser(db, acme.staffId, () =>
      rows<{ id: string }>(db, "SELECT id FROM submit_change('sales', $1, '{\"quantity\": 2}', 'One returned')", [saleId]),
    );
    const adminNotes = await notificationsFor(acme.adminId, "change_request");
    expect(adminNotes.at(-1)).toMatchObject({ link_table: "pending_updates", link_id: id });
    expect(adminNotes.at(-1)?.title).toMatch(/requested a change/);

    await asUser(db, acme.adminId, () => db.query("SELECT review_change($1, 'send_back', 'Which one?')", [id]));
    const staffNotes = await notificationsFor(acme.staffId, "change_sent_back_for_review");
    expect(staffNotes).toHaveLength(1);
  });

  it("warns about low stock once per dip, and again after a restock", async () => {
    const productId = await createProduct(db, acme.businessId, "Bread", 6, 30);
    await recordSale(db, acme.staffId, productId, { quantity: 2 }); // 4 left: alert
    await recordSale(db, acme.staffId, productId, { quantity: 1 }); // 3 left: no repeat
    expect((await notificationsFor(acme.adminId, "low_stock")).filter((n) => n.link_id === productId)).toHaveLength(1);
    await asUser(db, acme.staffId, () => db.query("SELECT add_stock($1, 10)", [productId])); // back to 13: reset
    await recordSale(db, acme.staffId, productId, { quantity: 10 }); // 3 left: alert again
    expect((await notificationsFor(acme.adminId, "low_stock")).filter((n) => n.link_id === productId)).toHaveLength(2);
  });

  it("notifies overdue credits once, however often it's called", async () => {
    const productId = await createProduct(db, acme.businessId, "Rice", 100, 10);
    const customerId = await createCustomerAs(db, acme.staffId, "Late Payer");
    const saleId = await recordSale(db, acme.staffId, productId, { type: "credit", customerId, saleDay: "2026-01-01", dueDate: "2026-01-05" });
    const [{ id: creditId }] = await rows<{ id: string }>(db, "SELECT id FROM credits WHERE sale_id = $1", [saleId]);
    await asUser(db, acme.staffId, () => db.query("SELECT notify_overdue_credits()"));
    await asUser(db, acme.staffId, () => db.query("SELECT notify_overdue_credits()"));
    const overdue = (await notificationsFor(acme.adminId, "credit_overdue")).filter((n) => n.link_id === creditId);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].title).toBe("Late Payer's credit is overdue");
  });

  it("respects preferences", async () => {
    await asUser(db, acme.adminId, () =>
      db.query("INSERT INTO notification_preferences (user_id, low_stock) VALUES ($1, false)", [acme.adminId]),
    );
    const before = (await notificationsFor(acme.adminId, "low_stock")).length;
    const productId = await createProduct(db, acme.businessId, "Milk", 6, 30);
    await recordSale(db, acme.staffId, productId, { quantity: 3 });
    expect((await notificationsFor(acme.adminId, "low_stock")).length).toBe(before);
  });

  it("users read and mark only their own; nobody can insert", async () => {
    const mine = await asUser(db, acme.staffId, () => rows<{ user_id: string }>(db, "SELECT user_id FROM notifications"));
    expect(mine.every((n) => n.user_id === acme.staffId)).toBe(true);
    const updated = await asUser(db, acme.staffId, () =>
      rows(db, "UPDATE notifications SET read_at = now() WHERE user_id = $1 RETURNING id", [acme.adminId]),
    );
    expect(updated).toHaveLength(0);
    const msg = await asUser(db, acme.staffId, () =>
      expectError(db, "INSERT INTO notifications (business_id, user_id, kind, title) VALUES ($1, $2, 'x', 'spam')", [acme.businessId, acme.adminId]),
    );
    expect(msg).toMatch(/permission denied/);
    const titleEdit = await asUser(db, acme.staffId, () => expectError(db, "UPDATE notifications SET title = 'x'"));
    expect(titleEdit).toMatch(/permission denied/);
  });
});
