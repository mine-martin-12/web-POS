// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createBusiness, createDb, expectError, inviteMember, rows, type Db } from "./harness";

let db: Db;
let acme: { businessId: string; adminId: string; staffId: string };
let rival: { businessId: string; adminId: string };

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = { ...a, staffId: await inviteMember(db, a.businessId, "staff@acme.test") };
  rival = await createBusiness(db, "Rival", "owner@rival.test");
}, 60_000);

const insert = "INSERT INTO expenses (category, amount, expense_date) VALUES ('Rent', 15000, '2026-10-01') RETURNING id, business_id";

describe("expenses", () => {
  it("admins record expenses for their own business", async () => {
    const [row] = await asUser(db, acme.adminId, () => rows<{ business_id: string }>(db, insert));
    expect(row.business_id).toBe(acme.businessId);
  });

  it("are invisible and unwritable for staff", async () => {
    expect(await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM expenses"))).toHaveLength(0);
    const msg = await asUser(db, acme.staffId, () => expectError(db, insert));
    expect(msg).toMatch(/row-level security|not an active member/);
  });

  it("are isolated between businesses", async () => {
    expect(await asUser(db, rival.adminId, () => rows(db, "SELECT * FROM expenses"))).toHaveLength(0);
  });

  it("reject zero or negative amounts", async () => {
    const msg = await asUser(db, acme.adminId, () =>
      expectError(db, "INSERT INTO expenses (category, amount, expense_date) VALUES ('x', 0, '2026-10-01')"),
    );
    expect(msg).toMatch(/expenses_amount_positive/);
  });

  it("are audited", async () => {
    const [{ n }] = await rows<{ n: number }>(db, "SELECT count(*)::int AS n FROM activity_logs WHERE table_name = 'expenses'");
    expect(n).toBeGreaterThan(0);
  });
});
