// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { addDaysToKey, todayKey } from "@/lib/dates";
import { openDatabase } from "../db/boot";
import { demoDb, rows, setActor, type DemoMembers } from "../db/engine";
import { demoApi } from "../api";
import { DEMO_DAYS, DEMO_TIME_ZONE, seedDemo } from ".";

const NOW = new Date("2026-10-05T11:30:00Z"); // 14:30 in Nairobi
const TODAY = todayKey(DEMO_TIME_ZONE, NOW);
let who: DemoMembers;
let seconds = 0;

const count = async (sql: string, params: unknown[] = []) =>
  (await rows<{ n: number }>(demoDb(), `SELECT count(*)::int AS n FROM ${sql}`, params))[0].n;

beforeAll(async () => {
  const { db } = await openDatabase();
  const started = Date.now();
  who = await seedDemo(db, { seed: 42, now: NOW });
  seconds = (Date.now() - started) / 1000;
}, 300_000);

describe("demo seed", () => {
  it("builds Demo Shop with an admin and two staff, active (no trial lockout)", async () => {
    console.info(`seeded in ${seconds.toFixed(1)} s`);
    const [business] = await rows<{ name: string; currency: string; timezone: string; account_status: string }>(
      demoDb(),
      "SELECT name, currency, timezone, account_status FROM public.businesses",
    );
    expect(business).toEqual({ name: "Demo Shop", currency: "KES", timezone: "Africa/Nairobi", account_status: "active" });
    const roles = await rows<{ role: string }>(demoDb(), "SELECT role::text AS role FROM public.user_roles ORDER BY role");
    expect(roles.map((r) => r.role)).toEqual(["admin", "user", "user"]);
  });

  it("has ~40 products, a few low on stock and two archived", async () => {
    expect(await count("public.products")).toBe(40);
    expect(await count("public.products WHERE archived_at IS NOT NULL")).toBe(2);
    expect(await count("public.products WHERE archived_at IS NULL AND stock_quantity < 5")).toBeGreaterThanOrEqual(3);
    expect(await count("public.products WHERE stock_quantity < 0")).toBe(0);
  });

  it("has 20–30 customers, most with fictional +254 700 000 1xx numbers", async () => {
    const total = await count("public.customers");
    expect(total).toBeGreaterThanOrEqual(20);
    expect(total).toBeLessThanOrEqual(30);
    expect(await count("public.customers WHERE phone LIKE '+2547000001%'")).toBeGreaterThan(total * 0.7);
  });

  it("has about three months of sales up to today, none in the future", async () => {
    const [span] = await rows<{ first: string; last: string; n: number }>(
      demoDb(),
      "SELECT min((sale_date AT TIME ZONE $1)::date)::text AS first, max((sale_date AT TIME ZONE $1)::date)::text AS last, count(*)::int AS n FROM public.sales",
      [DEMO_TIME_ZONE],
    );
    expect(span.first).toBe(addDaysToKey(TODAY, -DEMO_DAYS + 1));
    expect(span.last).toBe(TODAY);
    expect(span.n).toBeGreaterThan(400);
    expect(await count("public.sales WHERE sale_date > $1", [NOW.toISOString()])).toBe(0);
    const methods = await rows<{ payment_method: string }>(demoDb(), "SELECT DISTINCT payment_method FROM public.sales ORDER BY 1");
    expect(methods.map((m) => m.payment_method)).toEqual(["bank_cheque", "cash", "credit", "mpesa"]);
  });

  it("has paid, partly paid and overdue credits whose balances match their payments", async () => {
    expect(await count("public.credits WHERE status = 'paid'")).toBeGreaterThan(5);
    expect(await count("public.credits WHERE status = 'partially_paid'")).toBeGreaterThan(2);
    expect(await count("public.credits WHERE status <> 'paid' AND due_date < $1", [TODAY])).toBeGreaterThanOrEqual(3);
    const mismatched = await count(
      `public.credits c WHERE c.amount_paid <> COALESCE((SELECT sum(amount) FROM public.credit_payments p WHERE p.credit_id = c.id), 0)`,
    );
    expect(mismatched).toBe(0);
  });

  it("has expenses in several categories and monthly totals with revenue, cost and profit", async () => {
    const categories = await rows<{ category: string }>(demoDb(), "SELECT DISTINCT category FROM public.expenses");
    expect(categories.length).toBeGreaterThanOrEqual(5);
    setActor(who.adminId);
    const months = await demoApi.sales.fetchMonthSummary();
    expect(months.length).toBeGreaterThanOrEqual(3);
    for (const m of months.filter((x) => x.sales_count > 50)) {
      expect(m.billed).toBeGreaterThan(m.cost);
      expect(m.cost).toBeGreaterThan(0);
    }
  });

  it("has staff change requests: pending, sent back and approved", async () => {
    expect(await count("public.pending_updates WHERE status = 'pending'")).toBeGreaterThanOrEqual(2);
    expect(await count("public.pending_updates WHERE status = 'sent_back_for_review'")).toBe(1);
    expect(await count("public.pending_updates WHERE status = 'approved'")).toBe(1);
  });

  it("has a recent audit trail and notifications, some unread", async () => {
    const [{ first }] = await rows<{ first: string }>(
      demoDb(),
      "SELECT (min(created_at) AT TIME ZONE $1)::date::text AS first FROM public.activity_logs",
      [DEMO_TIME_ZONE],
    );
    expect(first).toBe(addDaysToKey(TODAY, -DEMO_DAYS));
    expect(await count("public.notifications WHERE user_id = $1", [who.adminId])).toBeGreaterThan(3);
    expect(await count("public.notifications WHERE user_id = $1 AND read_at IS NULL", [who.adminId])).toBeGreaterThan(0);
  });

  it("has SMS templates and history, and broadcast audiences with consistent counts", async () => {
    expect(await count("public.sms_templates")).toBe(4);
    expect(await count("public.sms_messages WHERE status = 'sent'")).toBeGreaterThan(3);
    setActor(who.adminId);
    const [all, owing, overdue] = await Promise.all(
      (["all", "owing", "overdue"] as const).map((a) => demoApi.messaging.fetchAudience(a)),
    );
    expect(all.length).toBeGreaterThan(owing.length);
    expect(owing.length).toBeGreaterThanOrEqual(overdue.length);
    expect(overdue.length).toBeGreaterThan(0);
  });

  it("has one pending (simulated) invitation", async () => {
    setActor(who.adminId);
    const invitations = await demoApi.staff.fetchInvitations();
    expect(invitations.map((i) => i.email)).toEqual(["peter@demoshop.example"]);
  });
});
