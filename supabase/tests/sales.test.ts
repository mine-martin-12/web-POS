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
let acme: { businessId: string; adminId: string; staffId: string; productId: string; customerId: string };

const fail = (p: Promise<unknown>) => p.then(() => "no error").catch((e: Error) => e.message);

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  const staffId = await inviteMember(db, a.businessId, "staff@acme.test");
  acme = {
    ...a,
    staffId,
    productId: await createProduct(db, a.businessId, "Rice", 1000, 40),
    customerId: await createCustomerAs(db, staffId, "Otieno", "0722000111"),
  };
}, 60_000);

async function saleWithCredit(saleId: string) {
  const [row] = await rows<{
    total: string;
    method: string;
    owed: string | null;
    paid: string | null;
    status: string | null;
    customer: string | null;
  }>(
    db,
    `SELECT s.total_price AS total, s.payment_method AS method, c.amount_owed AS owed, c.amount_paid AS paid,
            c.status::text AS status, c.customer_name AS customer
     FROM sales s LEFT JOIN credits c ON c.sale_id = s.id WHERE s.id = $1`,
    [saleId],
  );
  return row;
}

describe("record_sale", () => {
  it("records a paid sale with no credit", async () => {
    const id = await recordSale(db, acme.staffId, acme.productId, { quantity: 3, price: 55.5, method: "mpesa" });
    expect(await saleWithCredit(id)).toMatchObject({ total: "166.50", method: "mpesa", owed: null });
  });

  it("records a partial payment as a credit with the deposit already paid and logged", async () => {
    const id = await recordSale(db, acme.staffId, acme.productId, {
      quantity: 2,
      price: 100,
      type: "partial",
      deposit: 50,
      method: "cash",
      customerId: acme.customerId,
    });
    expect(await saleWithCredit(id)).toMatchObject({
      total: "200.00",
      method: "cash",
      owed: "200.00",
      paid: "50.00",
      status: "partially_paid",
      customer: "Otieno",
    });
    const payments = await rows<{ amount: string }>(
      db,
      "SELECT p.amount FROM credit_payments p JOIN credits c ON c.id = p.credit_id WHERE c.sale_id = $1",
      [id],
    );
    expect(payments.map((p) => p.amount)).toEqual(["50.00"]);
  });

  it("records a full credit sale", async () => {
    const id = await recordSale(db, acme.staffId, acme.productId, { type: "credit", customerId: acme.customerId });
    expect(await saleWithCredit(id)).toMatchObject({ method: "credit", paid: "0.00", status: "unpaid" });
  });

  it.each([
    [{ type: "partial", deposit: 0 }, /deposit must be more than 0/],
    [{ type: "partial", deposit: 100 }, /deposit must be more than 0 and less than the total/],
    [{ type: "credit", customerId: null }, /Choose the customer/],
    [{ type: "credit", dueDate: "2000-01-01" }, /due date can't be before the sale/],
    [{ saleDay: "2999-01-01" }, /can't be in the future/],
    [{ price: -1 }, /can't be negative/],
  ] as const)("rejects invalid input %j", async (options, message) => {
    const msg = await fail(
      recordSale(db, acme.staffId, acme.productId, { customerId: acme.customerId, ...options } as never),
    );
    expect(msg).toMatch(message);
  });

  it("stores a back-dated sale at local noon on that day", async () => {
    const id = await recordSale(db, acme.staffId, acme.productId, { saleDay: "2026-01-15" });
    const [row] = await rows<{ local_day: string }>(
      db,
      "SELECT (sale_date AT TIME ZONE 'Africa/Nairobi')::date::text AS local_day FROM sales WHERE id = $1",
      [id],
    );
    expect(row.local_day).toBe("2026-01-15");
  });

  it("leaves nothing behind when part of the sale fails", async () => {
    const [{ n: before }] = await rows<{ n: number }>(db, "SELECT count(*)::int AS n FROM sales");
    await fail(recordSale(db, acme.staffId, acme.productId, { type: "credit", customerId: "00000000-0000-0000-0000-000000000000" }));
    const [{ n: after }] = await rows<{ n: number }>(db, "SELECT count(*)::int AS n FROM sales");
    expect(after).toBe(before);
  });
});

describe("update_sale", () => {
  let creditSale: string;
  let cashSale: string;

  beforeAll(async () => {
    creditSale = await recordSale(db, acme.staffId, acme.productId, {
      quantity: 2,
      price: 100,
      type: "partial",
      deposit: 150,
      customerId: acme.customerId,
    });
    cashSale = await recordSale(db, acme.staffId, acme.productId, { quantity: 1, price: 10 });
  });

  const update = (saleId: string, changes: object, userId = acme.adminId) =>
    asUser(db, userId, () => rows(db, "SELECT * FROM update_sale($1, $2)", [saleId, JSON.stringify(changes)]));

  it("keeps the credit in step with the new total", async () => {
    await update(creditSale, { quantity: 3 });
    expect(await saleWithCredit(creditSale)).toMatchObject({ total: "300.00", owed: "300.00", paid: "150.00" });
  });

  it("refuses a total below what the customer already paid", async () => {
    expect(await fail(update(creditSale, { selling_price: 10 }))).toMatch(/already paid/);
  });

  it("refuses fields outside the whitelist", async () => {
    expect(await fail(update(cashSale, { business_id: "x" }))).toMatch(/can't be changed/);
    expect(await fail(update(cashSale, { total_price: 1 }))).toMatch(/can't be changed/);
  });

  it("changes the method of a paid sale but not of a credit sale", async () => {
    await update(cashSale, { payment_method: "mpesa" });
    expect((await saleWithCredit(cashSale)).method).toBe("mpesa");
    expect(await fail(update(creditSale, { payment_method: "cash" }))).toMatch(/Credits page/);
  });

  it("moves stock when the quantity changes", async () => {
    const stock = async () =>
      (await rows<{ s: number }>(db, "SELECT stock_quantity AS s FROM products WHERE id = $1", [acme.productId]))[0].s;
    const before = await stock();
    await update(cashSale, { quantity: 6 });
    expect(await stock()).toBe(before - 5);
  });

  it("is admin-only", async () => {
    expect(await fail(update(cashSale, { quantity: 1 }, acme.staffId))).toMatch(/Admin privileges required/);
  });
});

describe("products", () => {
  it("staff can add and restock but not edit or archive", async () => {
    const msg = await asUser(db, acme.staffId, () =>
      rows(db, "UPDATE products SET buying_price = 1 WHERE id = $1 RETURNING id", [acme.productId]),
    );
    expect(msg).toHaveLength(0);
    const msg2 = await asUser(db, acme.staffId, () =>
      rows(db, "UPDATE products SET archived_at = now() WHERE id = $1 RETURNING id", [acme.productId]),
    );
    expect(msg2).toHaveLength(0);
  });

  it("archived products can't be sold", async () => {
    const productId = await createProduct(db, acme.businessId, "Old stock", 10, 1);
    await asUser(db, acme.adminId, () => db.query("UPDATE products SET archived_at = now() WHERE id = $1", [productId]));
    expect(await fail(recordSale(db, acme.staffId, productId))).toMatch(/Product not found/);
  });
});

describe("direct writes are closed", () => {
  it.each([
    ["UPDATE credits SET amount_paid = amount_owed", /permission denied/],
    ["DELETE FROM credits", /permission denied/],
  ])("%s", async (sql, message) => {
    const msg = await asUser(db, acme.adminId, () => expectError(db, sql));
    expect(msg).toMatch(message);
  });
});
