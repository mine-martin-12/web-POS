// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createBusiness,
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

const setStatus = (status: string, trialEndsAt: string | null = null) =>
  db.query("UPDATE businesses SET account_status = $2, trial_ends_at = $3 WHERE id = $1", [acme.businessId, status, trialEndsAt]);

beforeAll(async () => {
  db = await createDb();
  const a = await createBusiness(db, "Acme", "owner@acme.test");
  acme = {
    ...a,
    staffId: await inviteMember(db, a.businessId, "staff@acme.test"),
    productId: await createProduct(db, a.businessId),
  };
}, 60_000);

describe("trial and subscription gating", () => {
  it("starts new businesses on a 14-day trial", async () => {
    const [b] = await rows<{ account_status: string; days: number }>(
      db,
      "SELECT account_status, round(extract(epoch FROM trial_ends_at - now()) / 86400)::int AS days FROM businesses WHERE id = $1",
      [acme.businessId],
    );
    expect(b).toEqual({ account_status: "trial", days: 14 });
  });

  it("works normally during the trial", async () => {
    await expect(recordSale(db, acme.staffId, acme.productId)).resolves.toBeTruthy();
  });

  it.each([
    ["an expired trial", "trial", "2000-01-01T00:00:00Z"],
    ["an expired account", "expired", null],
    ["a suspended account", "suspended", null],
  ])("blocks all data access for %s, at the database level", async (_label, status, endsAt) => {
    await setStatus(status, endsAt);
    for (const userId of [acme.adminId, acme.staffId]) {
      for (const table of ["products", "sales", "credits", "customers_secure", "pending_updates", "activity_logs"]) {
        const found = await asUser(db, userId, () => rows(db, `SELECT * FROM ${table}`));
        expect(found, `${table} for ${userId}`).toHaveLength(0);
      }
      const msg = await recordSale(db, userId, acme.productId).catch((e: Error) => e.message);
      expect(msg).toMatch(/not an active member/);
    }
    // …but they can still see their business (for the expired page) and their own role.
    const [business] = await asUser(db, acme.adminId, () =>
      rows<{ account_status: string }>(db, "SELECT account_status FROM businesses"),
    );
    expect(business.account_status).toBe(status);
    const roles = await asUser(db, acme.adminId, () => rows(db, "SELECT role FROM user_roles"));
    expect(roles).toHaveLength(1);
    await setStatus("active");
  });

  it("admins can't change their own account status or trial", async () => {
    for (const sql of [
      "UPDATE businesses SET account_status = 'active' WHERE id = $1",
      "UPDATE businesses SET trial_ends_at = '2999-01-01' WHERE id = $1",
    ]) {
      const msg = await asUser(db, acme.adminId, () => expectError(db, sql, [acme.businessId]));
      expect(msg).toMatch(/permission denied/);
    }
  });

  it("re-activating restores access", async () => {
    await setStatus("expired");
    await setStatus("active");
    const found = await asUser(db, acme.staffId, () => rows(db, "SELECT * FROM products"));
    expect(found.length).toBeGreaterThan(0);
  });
});
