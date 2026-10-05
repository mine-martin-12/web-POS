// @vitest-environment node
//
// The demo API against the real migrations (PGlite in memory): the main flows work and
// the production rules (RLS, masking, admin-only actions) apply unchanged.
import { beforeAll, describe, expect, it } from "vitest";
import { createBusiness, inviteMember, rows } from "./db/core";
import { openDatabase, saveMembers } from "./db/boot";
import { demoDb, installDatabase, setActor, type DemoMembers } from "./db/engine";
import { demoApi } from "./api";
import type { RecordSaleInput } from "@/features/sales/types";

let who: DemoMembers;
let productId: string;

const saleInput = (input: Partial<RecordSaleInput>): RecordSaleInput => ({
  productId,
  quantity: 1,
  sellingPrice: 100,
  paymentType: "paid",
  paymentMethod: "cash",
  deposit: 0,
  dueDate: null,
  customerId: null,
  saleDay: null,
  description: "",
  ...input,
});

const asAdmin = () => setActor(who.adminId);
const asStaff = () => setActor(who.staffId);

beforeAll(async () => {
  const { db } = await openDatabase();
  const { businessId, adminId } = await createBusiness(db, "Demo Shop", "amina@demo.test", {
    first_name: "Amina",
    last_name: "Wanjiku",
  });
  const staffId = await inviteMember(db, businessId, "brian@demo.test", "user", { first_name: "Brian", last_name: "Otieno" });
  const otherStaffId = await inviteMember(db, businessId, "grace@demo.test", "user", { first_name: "Grace", last_name: "Muthoni" });
  who = { businessId, adminId, staffId, otherStaffId };
  await saveMembers(db, who);
  installDatabase(db, who);
  asAdmin();
  await demoApi.products.createProduct({ name: "Unga 2kg", description: "", size: "2kg", buying_price: 150, stock_quantity: 20 });
  [{ id: productId }] = await demoApi.products.fetchProducts();
}, 120_000);

describe("demo engine: main flows", () => {
  it("records a cash sale and takes it off stock", async () => {
    asAdmin();
    await demoApi.sales.recordSale(saleInput({ productId, quantity: 2, sellingPrice: 180, paymentType: "paid", paymentMethod: "cash" }));
    const [product] = await demoApi.products.fetchProducts();
    expect(product.stock_quantity).toBe(18);
    const [sale] = await demoApi.sales.fetchSales();
    expect(sale).toMatchObject({ product_name: "Unga 2kg", quantity: 2, total_price: 360, unit_cost: 150, payment_method: "cash" });
    expect(sale.credit).toBeNull();
  });

  it("records a part-paid sale as a credit with a deposit, then takes a payment", async () => {
    asAdmin();
    const created = await demoApi.customers.createCustomer({ name: "Otieno Ouma", phone: "0700 000 101" });
    if (created.status !== "created") throw new Error(created.status);
    const customerId = created.customer.id;

    await demoApi.sales.recordSale(saleInput({
      productId,
      quantity: 1,
      sellingPrice: 1000,
      paymentType: "partial",
      paymentMethod: "mpesa",
      deposit: 400,
      dueDate: "2099-01-01",
      customerId,
    }));
    let credit = (await demoApi.credits.fetchCredits()).find((c) => c.customer_id === customerId)!;
    expect(credit).toMatchObject({ amount_owed: 1000, amount_paid: 400, status: "partially_paid" });

    await demoApi.credits.recordCreditPayment({ creditId: credit.id, amount: 600, method: "cash" });
    credit = (await demoApi.credits.fetchCredits()).find((c) => c.id === credit.id)!;
    expect(credit).toMatchObject({ amount_paid: 1000, status: "paid" });
    const payments = await demoApi.credits.fetchCreditPayments(credit.id);
    expect(payments.map((p) => p.amount).sort()).toEqual([400, 600]);
  });

  it("rejects what production rejects, with the same message", async () => {
    asAdmin();
    await expect(
      demoApi.sales.recordSale(saleInput({ productId, quantity: 0, sellingPrice: 10, paymentType: "paid", paymentMethod: "cash" })),
    ).rejects.toThrow("Quantity must be at least 1");
  });

  it("reuses a customer on a phone match", async () => {
    asAdmin();
    const again = await demoApi.customers.createCustomer({ name: "Someone Else", phone: "+254700000101" });
    if (again.status !== "existing_phone") throw new Error(again.status);
    expect(again.customer.name).toBe("Otieno Ouma");
  });
});

describe("demo engine: same permissions as production", () => {
  it("shows staff only their own sales", async () => {
    asStaff();
    await demoApi.sales.recordSale(saleInput({ productId, quantity: 1, sellingPrice: 180, paymentType: "paid", paymentMethod: "cash" }));
    const mine = await demoApi.sales.fetchSales();
    expect(mine).toHaveLength(1);
    expect(mine[0].created_by).toBe(who.staffId);
    asAdmin();
    expect((await demoApi.sales.fetchSales()).length).toBeGreaterThan(1);
  });

  it("masks phones for staff and shows them to admins", async () => {
    asStaff();
    const [staffView] = await demoApi.customers.fetchCustomers();
    expect(staffView.phone).toBe("+2547000***01");
    asAdmin();
    const [adminView] = await demoApi.customers.fetchCustomers();
    expect(adminView.phone).toBe("+254700000101");
  });

  it("keeps expenses and the activity log admin-only", async () => {
    asAdmin();
    await demoApi.expenses.createExpense({ category: "Rent", description: "", amount: 15000, expense_date: "2026-10-01", payment_method: "mpesa" });
    expect(await demoApi.expenses.fetchExpenses("2026-10-01", "2026-10-31")).toHaveLength(1);
    asStaff();
    expect(await demoApi.expenses.fetchExpenses("2026-10-01", "2026-10-31")).toHaveLength(0);
    const filters = { from: "2000-01-01", to: "2100-01-01", actor: null, action: null, table: null, search: "", timeZone: "Africa/Nairobi" };
    expect((await demoApi.activity.fetchActivityPage(filters, 0, 25)).total).toBe(0);
    asAdmin();
    expect((await demoApi.activity.fetchActivityPage(filters, 0, 25)).total).toBeGreaterThan(0);
  });

  it("routes staff edits through approval: submit, then the admin approves", async () => {
    asStaff();
    const [mySale] = await demoApi.sales.fetchSales();
    await demoApi.approvals.submitChange({ table: "sales", recordId: mySale.id, values: { quantity: 3 }, reason: "Customer took one more" });
    asAdmin();
    expect(await demoApi.approvals.countApprovalsBadge({ reviewer: true, userId: who.adminId })).toBe(1);
    const [request] = await demoApi.approvals.fetchChangeRequests();
    await demoApi.approvals.reviewChange({ id: request.id, decision: "approve" });
    const sale = (await demoApi.sales.fetchSales()).find((s) => s.id === mySale.id)!;
    expect(sale.quantity).toBe(3);
  });

  it("lets only admins manage staff, never themselves", async () => {
    asStaff();
    await expect(demoApi.staff.inviteMember({ email: "x@demo.test", firstName: "X", lastName: "Y", role: "user", delivery: "email" })).rejects.toThrow(
      "Admin privileges required",
    );
    asAdmin();
    await expect(demoApi.staff.setMemberActive(who.adminId, false)).rejects.toThrow("You can't deactivate your own account");
    const invited = await demoApi.staff.inviteMember({ email: "new@demo.test", firstName: "New", lastName: "Hire", role: "user", delivery: "email" });
    expect(invited.emailSent).toBe(true);
    expect((await demoApi.staff.fetchInvitations()).map((i) => i.email)).toContain("new@demo.test");
  });
});

describe("demo engine: simulated SMS", () => {
  it("sends to this business's customers with phones, logged as sent, without any network call", async () => {
    asAdmin();
    const audience = await demoApi.messaging.fetchAudience("all");
    expect(audience.map((a) => a.name)).toEqual(["Otieno Ouma"]);
    const result = await demoApi.messaging.sendSms({ customerIds: audience.map((a) => a.customer_id), message: "Hi {customer_name}!", broadcast: true });
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    const [message] = await demoApi.messaging.fetchMessages("2000-01-01T00:00:00Z");
    expect(message).toMatchObject({ body: "Hi Otieno!", status: "sent", kind: "broadcast" });
    // Nothing else in the database changed role or leaked: still one business.
    const [{ n }] = await rows<{ n: number }>(demoDb(), "SELECT count(*)::int AS n FROM public.businesses");
    expect(n).toBe(1);
  });

  it("refuses staff", async () => {
    asStaff();
    await expect(demoApi.messaging.fetchAudience("all")).rejects.toThrow("Admin privileges required");
    await expect(demoApi.messaging.sendSms({ customerIds: [who.adminId], message: "x" })).rejects.toThrow("Admin privileges required");
  });
});
