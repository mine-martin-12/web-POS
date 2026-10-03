// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { renderTemplate as browserRender } from "../../src/lib/smsTemplate";
import { renderTemplate as serverRender } from "../functions/_shared/template";
import { asUser, createBusiness, createCustomerAs, createDb, createProduct, expectError, inviteMember, recordSale, rows, type Db } from "./harness";

const CASES: Array<[string, Record<string, string>]> = [
  ["Hi {customer_name}, you owe {amount_due} due {due_date}. {business_name}", { customer_name: "Akinyi", amount_due: "KES 500.00", due_date: "5 Oct", business_name: "Acme" }],
  ["Hi {customer_name} , thanks!", { customer_name: "" }],
  ["Hi {customer_name}, {unknown} thanks", { customer_name: "Otieno" }],
  ["{customer_name}, your balance is {amount_due}.", {}],
  ["Line one {x}\n  line two", {}],
];

describe("SMS templates", () => {
  it.each(CASES)("browser and server render %j the same", (template, values) => {
    expect(serverRender(template, values)).toBe(browserRender(template, values));
  });

  it("drops unused tokens and tidies spacing", () => {
    expect(browserRender("Hi {customer_name} , thanks!", {})).toBe("Hi, thanks!");
    expect(browserRender("Hi {customer_name}, {unknown} thanks", { customer_name: "Otieno" })).toBe("Hi Otieno, thanks");
    expect(browserRender("{customer_name}, your balance is {amount_due}.", {})).toBe("your balance is.");
  });
});

describe("SMS data access", () => {
  let db: Db;
  let acme: { businessId: string; adminId: string; staffId: string };

  beforeAll(async () => {
    db = await createDb();
    const a = await createBusiness(db, "Acme", "owner@acme.test");
    acme = { ...a, staffId: await inviteMember(db, a.businessId, "staff@acme.test") };
    const productId = await createProduct(db, a.businessId);
    const owing = await createCustomerAs(db, acme.staffId, "Owing", "0711000001");
    await createCustomerAs(db, acme.staffId, "Paid up", "0711000002");
    await createCustomerAs(db, acme.staffId, "No phone");
    await recordSale(db, acme.staffId, productId, { type: "credit", customerId: owing, saleDay: "2026-01-01", dueDate: "2026-01-02" });
  }, 60_000);

  it("audiences only include customers with phones, filtered by what they owe", async () => {
    const audience = (kind: string) =>
      asUser(db, acme.adminId, () => rows<{ name: string }>(db, "SELECT name FROM sms_audience($1)", [kind])).then((r) => r.map((x) => x.name));
    expect(await audience("all")).toEqual(["Owing", "Paid up"]);
    expect(await audience("owing")).toEqual(["Owing"]);
    expect(await audience("overdue")).toEqual(["Owing"]);
  });

  it("is admin-only and messages can't be written by clients", async () => {
    expect(await asUser(db, acme.staffId, () => expectError(db, "SELECT * FROM sms_audience('all')"))).toMatch(/Admin/);
    expect(await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM sms_templates"))).toHaveLength(0);
    const msg = await asUser(db, acme.adminId, () =>
      expectError(db, "INSERT INTO sms_messages (business_id, phone, body) VALUES ($1, '+254700000000', 'spam')", [acme.businessId]),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("admins manage templates", async () => {
    const [t] = await asUser(db, acme.adminId, () =>
      rows<{ business_id: string }>(db, "INSERT INTO sms_templates (name, body) VALUES ('Reminder', 'Hi {customer_name}') RETURNING business_id"),
    );
    expect(t.business_id).toBe(acme.businessId);
  });
});
