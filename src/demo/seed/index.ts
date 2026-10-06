/**
 * Builds "Demo Shop": three members, a catalogue, customers and ~3 months of trading,
 * entered day by day through the SAME database functions the app uses (record_sale,
 * record_credit_payment, add_stock, submit_change/review_change, create_customer, the
 * simulated send-sms and invite-staff), so stock, credits, balances, the audit log and
 * notifications are exactly what production would hold.
 *
 * Two parts, so the browser does as little as possible:
 *  - seedHistory: everything up to yesterday. Built once at build time
 *    (scripts/build-demo-snapshot.ts) and shipped as a database snapshot.
 *  - seedToday: today's trading, recorded live when the demo opens, after
 *    shiftToToday has moved the snapshot's dates so that its "yesterday" is yesterday.
 * seedDemo runs both (tests, and the dev server when there's no snapshot).
 *
 * The database clock can't be wound back, so each simulated day's rows are recorded
 * against a window of real time; afterwards, timestamps in each window are mapped onto that
 * day's business hours (08:00–19:00 Nairobi).
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { addDaysToKey, startOfDayUtc, todayKey } from "@/lib/dates";
import { createBusiness, inviteMember, rows } from "../db/core";
import { callRpc, installDatabase, setActor, type DemoMembers } from "../db/engine";
import * as edge from "../simulate/edge";
import { CATALOG, CUSTOMER_NAMES, MEMBERS, SMS_TEMPLATES, type CatalogItem } from "./catalog";
import { Random } from "./random";

export const DEMO_TIME_ZONE = "Africa/Nairobi";
export const DEMO_DAYS = 91;
const HOUR_MS = 3_600_000;

export interface SeedOptions {
  /** Same seed → same shop (tests); defaults to a random one. */
  seed?: number;
  /** "Now" for the seed; defaults to the real clock. */
  now?: Date;
  /** Days of history before today. */
  days?: number;
  onProgress?: (fraction: number) => void;
}

interface ProductState {
  id: string;
  item: CatalogItem;
  stock: number;
  archived: boolean;
  /** For "runs low" lines: how many are left at the end. */
  lowTarget: number;
}

interface CreditState {
  id: string;
  remaining: number;
  customerId: string;
}

interface PaymentPlan {
  credit: CreditState;
  /** "full" pays whatever is left; otherwise this share of what's left. */
  share: "full" | number;
}

interface Window {
  realFrom: string;
  realTo: string;
  simFrom: number;
  simTo: number;
}

type SetUser = (userId: string) => Promise<void>;

/** Everything one trading day needs: the database, the members and the shop's state. */
interface Shop {
  db: PGlite;
  rng: Random;
  now: Date;
  today: string;
  members: DemoMembers;
  cashiers: Array<{ id: string; weight: number }>;
  products: ProductState[];
  customers: string[];
  payments: Map<string, PaymentPlan[]>;
  salesBy: Map<string, Array<{ id: string }>>;
  nextCustomer: number;
}

const round10 = (value: number) => Math.max(10, Math.round(value / 10) * 10);
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const dayOfMonth = (key: string) => Number(key.slice(8, 10));
/** Shelf price (catalogue price plus ~5%), occasionally with a small discount; rounded to KES 5. */
const priceOf = (item: CatalogItem, discounted: boolean) => Math.round((item.sell * (discounted ? 1.0 : 1.05)) / 5) * 5;
const phoneFor = (index: number) => `0700 000 ${100 + index}`;
const pickCashier = (shop: Shop) => shop.rng.weighted(shop.cashiers, (c) => c.weight).id;

/** One transaction as `authenticated`; setUser() picks the member (JWT sub). */
function trade(db: PGlite, fn: (tx: Transaction, setUser: SetUser) => Promise<void>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE authenticated");
    await fn(tx, async (userId) => {
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    });
  });
}

/** One event as one member, in its own transaction (so it gets its own timestamp). */
const as = (shop: Shop, userId: string, fn: (tx: Transaction) => Promise<unknown>) =>
  trade(shop.db, async (tx, setUser) => {
    await setUser(userId);
    await fn(tx);
  });

async function newCustomer(shop: Shop, tx: Transaction): Promise<string> {
  const index = shop.nextCustomer++;
  const name = CUSTOMER_NAMES[index % CUSTOMER_NAMES.length];
  const phone = index % 7 === 6 ? null : phoneFor(index);
  const result = await callRpc<{ customer: { id: string } }>(tx, "create_customer", { _name: name, _phone: phone, _force: true }, "value");
  shop.customers.push(result.customer.id);
  return result.customer.id;
}

// ---------------------------------------------------------------------------------------
// History (build time)
// ---------------------------------------------------------------------------------------

/** The business, its people and every trading day up to yesterday. */
export async function seedHistory(db: PGlite, options: SeedOptions = {}): Promise<DemoMembers> {
  const rng = new Random(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const now = options.now ?? new Date();
  const days = options.days ?? DEMO_DAYS;
  const today = todayKey(DEMO_TIME_ZONE, now);
  const firstDay = addDaysToKey(today, -days);
  const progress = options.onProgress ?? (() => {});
  const windows: Window[] = [];

  // --- People and the business (Supabase Auth sign-up + invitation path) -----------------
  let realFrom = await clock(db);
  const { businessId, adminId } = await createBusiness(db, "Demo Shop", MEMBERS.admin.email, MEMBERS.admin);
  const staffId = await inviteMember(db, businessId, MEMBERS.staff.email, "user", MEMBERS.staff);
  const otherStaffId = await inviteMember(db, businessId, MEMBERS.otherStaff.email, "user", MEMBERS.otherStaff);
  await db.query(
    `UPDATE public.businesses SET account_status = 'active', trial_ends_at = NULL, currency = 'KES', timezone = $2,
       phone = '+254 700 000 001', email = 'hello@demoshop.example', address = 'Moi Avenue, Nairobi'
     WHERE id = $1`,
    [businessId, DEMO_TIME_ZONE],
  );
  const members: DemoMembers = { businessId, adminId, staffId, otherStaffId };
  installDatabase(db, members);
  const shop: Shop = {
    db,
    rng,
    now,
    today,
    members,
    cashiers: cashiersOf(members),
    products: [],
    customers: [],
    payments: new Map(),
    salesBy: new Map(),
    nextCustomer: 0,
  };

  // --- Day 0: catalogue, opening stock, regular customers, SMS templates -------------------
  await trade(db, async (tx, setUser) => {
    // Staff finish accepting their invitations (as AcceptInvite does after setting a password).
    for (const id of [staffId, otherStaffId]) {
      await setUser(id);
      await rows(tx, "SELECT public.complete_invitation()");
    }
    await setUser(adminId);
    for (const item of CATALOG) {
      const [{ id }] = await rows<{ id: string }>(
        tx,
        `INSERT INTO public.products (name, description, size, buying_price, stock_quantity)
         VALUES ($1, '', $2, $3, $4) RETURNING id`,
        [item.name, item.size, item.buy, item.restock],
      );
      shop.products.push({ id, item, stock: item.restock, archived: false, lowTarget: rng.int(1, 4) });
    }
    for (let i = 0; i < 20; i++) await newCustomer(shop, tx);
    for (const t of SMS_TEMPLATES) {
      await rows(tx, "INSERT INTO public.sms_templates (name, body) VALUES ($1, $2)", [t.name, t.body]);
    }
  });
  windows.push(await window(db, realFrom, firstDay, now));

  // --- Trading days up to yesterday ----------------------------------------------------------
  for (let offset = 1; offset < days; offset++) {
    const day = addDaysToKey(firstDay, offset);
    const daysLeft = days - offset;
    realFrom = await clock(db);

    await tradeDay(shop, day, daysLeft, offset);

    // Staff change requests near the end (Approvals page, notifications): one approved,
    // one sent back, and Brian's still waiting from yesterday.
    if (daysLeft === 5 || daysLeft === 3 || daysLeft === 1) {
      await trade(db, async (tx, setUser) => {
        if (daysLeft === 1) await requestChange(tx, setUser, shop.salesBy.get(staffId), adminId, staffId, null);
        else await requestChange(tx, setUser, shop.salesBy.get(otherStaffId), adminId, otherStaffId, daysLeft === 5 ? "approve" : "send_back");
      });
    }

    // Simulated side effects, as the admin (send-sms / invite-staff stand-ins).
    setActor(adminId);
    if (daysLeft === 20) {
      await edge.sendSms({ customerIds: shop.customers.slice(0, 8), message: SMS_TEMPLATES[3].body, broadcast: true });
    }
    if (daysLeft === 7) await edge.sendSms({ customerIds: shop.customers.slice(2, 4), message: SMS_TEMPLATES[2].body });
    if (daysLeft === 2) await edge.sendOverdueReminders(SMS_TEMPLATES[1].body);
    if (daysLeft === 1) {
      const invited = MEMBERS.invited;
      await edge.inviteStaff({ email: invited.email, firstName: invited.first_name, lastName: invited.last_name, role: "user", delivery: "email" });
    }

    windows.push(await window(db, realFrom, day, now));
    progress(offset / days);
  }

  await backdate(db, windows, firstDay);
  await db.query(
    "INSERT INTO demo.meta (key, value) VALUES ('history_ends', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(addDaysToKey(today, -1))],
  );
  return members;
}

// ---------------------------------------------------------------------------------------
// Today (in the browser)
// ---------------------------------------------------------------------------------------

/**
 * Move every date and timestamp forward by whole days so the history ends yesterday:
 * the shop always looks current, whenever the snapshot was built.
 */
export async function shiftToToday(db: PGlite, now: Date = new Date()): Promise<number> {
  const [meta] = await rows<{ value: string }>(db, "SELECT value FROM demo.meta WHERE key = 'history_ends'");
  const yesterday = addDaysToKey(todayKey(DEMO_TIME_ZONE, now), -1);
  const shift = Math.round((Date.parse(yesterday) - Date.parse(meta.value)) / 86_400_000);
  if (shift === 0) return 0;

  const columns = await rows<{ table_name: string; column_name: string }>(
    db,
    `SELECT c.table_name, c.column_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.data_type IN ('timestamp with time zone', 'date')`,
  );
  await db.transaction(async (tx) => {
    // A plain data move: no audit rows, no updated_at triggers.
    await tx.exec("SET LOCAL session_replication_role = replica");
    for (const { table_name, column_name } of columns) {
      await tx.exec(`UPDATE public.${table_name} SET ${column_name} = ${column_name} + ${shift} * interval '1 day' WHERE ${column_name} IS NOT NULL`);
    }
    // Change requests compare against the sale's day (see change_snapshot), so move those too.
    for (const column of ["old_values", "new_values"]) {
      await tx.exec(
        `UPDATE public.pending_updates
         SET ${column} = jsonb_set(${column}, '{sale_day}', to_jsonb(((${column} ->> 'sale_day')::date + ${shift})::text))
         WHERE ${column} ? 'sale_day'`,
      );
    }
    await tx.query("UPDATE demo.meta SET value = $1 WHERE key = 'history_ends'", [JSON.stringify(yesterday)]);
  });
  return shift;
}

/** Today's trading so far, recorded live; then today's overdue alerts. */
export async function seedToday(db: PGlite, members: DemoMembers, options: SeedOptions = {}): Promise<void> {
  const now = options.now ?? new Date();
  const today = todayKey(DEMO_TIME_ZONE, now);
  const rng = new Random(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  installDatabase(db, members);

  // Rebuild the shop's state from the database.
  const byName = new Map(CATALOG.map((item) => [`${item.name}|${item.size}`, item]));
  const products = (
    await rows<{ id: string; name: string; size: string; stock_quantity: number; archived_at: string | null }>(
      db,
      "SELECT id, name, size, stock_quantity, archived_at FROM public.products",
    )
  )
    .map((p) => ({ p, item: byName.get(`${p.name}|${p.size}`) }))
    .filter((x): x is { p: (typeof x)["p"]; item: CatalogItem } => !!x.item)
    .map(({ p, item }) => ({ id: p.id, item, stock: p.stock_quantity, archived: !!p.archived_at, lowTarget: rng.int(1, 4) }));
  const customers = (await rows<{ id: string }>(db, "SELECT id FROM public.customers WHERE archived_at IS NULL ORDER BY created_at")).map((c) => c.id);
  const shop: Shop = {
    db,
    rng,
    now,
    today,
    members,
    cashiers: cashiersOf(members),
    products,
    customers,
    payments: new Map(),
    salesBy: new Map(),
    nextCustomer: CUSTOMER_NAMES.length,
  };
  // A couple of customers come in to pay towards what they owe.
  const owing = await rows<{ id: string; remaining: number; customer_id: string }>(
    db,
    `SELECT id, amount_owed - amount_paid AS remaining, customer_id FROM public.credits
     WHERE status <> 'paid' AND customer_id IS NOT NULL ORDER BY due_date DESC LIMIT 2`,
  );
  shop.payments.set(
    today,
    owing.map((c) => ({ credit: { id: c.id, remaining: Number(c.remaining), customerId: c.customer_id }, share: 0.5 })),
  );

  const realFrom = await clock(db);
  await tradeDay(shop, today, 0, DEMO_DAYS);
  await backdate(db, [await window(db, realFrom, today, now)], today);

  // Raise today's overdue alerts, and treat older notifications as already seen.
  await trade(db, async (tx, setUser) => {
    await setUser(members.adminId);
    await rows(tx, "SELECT public.notify_overdue_credits()");
  });
  await db.query("UPDATE public.notifications SET read_at = created_at + interval '2 hours' WHERE read_at IS NULL AND created_at < now() - interval '3 days'");
  setActor(members.adminId);
}

/** The whole shop in one go: history, then today (tests, and the dev server without a snapshot). */
export async function seedDemo(db: PGlite, options: SeedOptions = {}): Promise<DemoMembers> {
  const members = await seedHistory(db, options);
  await seedToday(db, members, { ...options, seed: (options.seed ?? 1) + 1 });
  return members;
}

// ---------------------------------------------------------------------------------------
// One trading day
// ---------------------------------------------------------------------------------------

function cashiersOf(members: DemoMembers) {
  return [
    { id: members.adminId, weight: 0.4 },
    { id: members.staffId, weight: 0.35 },
    { id: members.otherStaffId, weight: 0.25 },
  ];
}

async function tradeDay(shop: Shop, day: string, daysLeft: number, offset: number): Promise<void> {
  const { rng, products, members } = shop;
  const isToday = day === shop.today;
  const saleDay = isToday ? undefined : day;

  // Morning delivery: restock what's running out (the "runs low" lines stop being
  // reordered for the last two weeks, so they end the period low or out), expenses,
  // and the archived lines taken off the shelf.
  await as(shop, members.adminId, async (tx) => {
    for (const p of products) {
      if (p.archived || (p.item.runsLow && daysLeft < 14)) continue;
      if (p.stock < Math.max(6, Math.round(p.item.restock * 0.25))) {
        await callRpc(tx, "add_stock", { _product_id: p.id, _quantity: p.item.restock }, "row");
        p.stock += p.item.restock;
      }
    }
    for (const e of expensesFor(day, offset, rng)) {
      await rows(
        tx,
        "INSERT INTO public.expenses (category, description, amount, expense_date, payment_method) VALUES ($1, $2, $3, $4, $5)",
        [e.category, e.description, e.amount, day, e.method],
      );
    }
    if (daysLeft === 30) {
      for (const p of products.filter((x) => x.item.archived)) {
        await rows(tx, "UPDATE public.products SET archived_at = now() WHERE id = $1", [p.id]);
        p.archived = true;
      }
    }
  });

  // Customers paying off credit.
  for (const plan of shop.payments.get(day) ?? []) {
    const credit = plan.credit;
    if (credit.remaining <= 0) continue;
    const amount = plan.share === "full" ? credit.remaining : Math.min(credit.remaining, round10(credit.remaining * plan.share));
    await as(shop, pickCashier(shop), (tx) =>
      callRpc(tx, "record_credit_payment", { _credit_id: credit.id, _amount: amount, _payment_method: rng.chance(0.6) ? "mpesa" : "cash" }, "row"),
    );
    credit.remaining = Math.round((credit.remaining - amount) * 100) / 100;
  }

  // The "runs low" lines sell down over the last week to a handful left (no spike).
  if (daysLeft < 7) {
    for (const p of products.filter((x) => x.item.runsLow && !x.archived && x.stock > x.lowTarget)) {
      const quantity = Math.min(6, Math.ceil((p.stock - p.lowTarget) / (daysLeft + 1)));
      await as(shop, pickCashier(shop), (tx) =>
        callRpc(
          tx,
          "record_sale",
          {
            _product_id: p.id,
            _quantity: quantity,
            _selling_price: priceOf(p.item, false),
            _payment_type: "paid",
            _payment_method: rng.chance(0.5) ? "mpesa" : "cash",
            _sale_day: saleDay,
          },
          "row",
        ),
      );
      p.stock -= quantity;
    }
  }

  // Sales.
  const busy = [0.6, 1, 0.9, 0.95, 1, 1.25, 1.45][weekday(day)] * (dayOfMonth(day) >= 26 || dayOfMonth(day) <= 3 ? 1.2 : 1);
  let count = Math.round(rng.int(10, 18) * busy);
  if (isToday) {
    const localHour = (shop.now.getUTCHours() + 3) % 24;
    count = Math.round(count * Math.min(1, Math.max(0.25, (localHour - 8) / 11)));
  }
  for (let i = 0; i < count; i++) {
    const available = products.filter((p) => !p.archived && p.stock > 0);
    if (!available.length) break;
    const p = rng.weighted(available, (x) => x.item.weight);
    const quantity = Math.min(p.stock, p.item.multi ? rng.int(1, 6) : rng.chance(0.12) ? 2 : 1);
    const price = priceOf(p.item, rng.chance(0.08));
    const total = quantity * price;
    const kind = rng.next();
    const type = kind < 0.045 ? "credit" : kind < 0.085 ? "partial" : "paid";
    const onAccount = type !== "paid";
    const wantsCustomer = onAccount || rng.chance(0.25);
    const isNewCustomer = wantsCustomer && shop.nextCustomer < CUSTOMER_NAMES.length && rng.chance(0.08);
    const method = total > 3000 && rng.chance(0.4) ? "bank_cheque" : rng.chance(0.52) ? "mpesa" : "cash";
    const dueDate = onAccount ? addDaysToKey(day, rng.int(7, 30)) : undefined;
    const deposit = type === "partial" ? Math.min(total - 10, round10(total * (0.3 + rng.next() * 0.3))) : 0;
    if (type === "partial" && deposit <= 0) continue;
    if (wantsCustomer && !isNewCustomer && !shop.customers.length) continue;
    const cashier = pickCashier(shop);

    await as(shop, cashier, async (tx) => {
      const customerId = wantsCustomer ? (isNewCustomer ? await newCustomer(shop, tx) : rng.pick(shop.customers)) : null;
      const sale = await callRpc<{ id: string }>(
        tx,
        "record_sale",
        {
          _product_id: p.id,
          _quantity: quantity,
          _selling_price: price,
          _payment_type: type,
          _payment_method: method,
          _deposit: deposit,
          _due_date: dueDate,
          _customer_id: customerId ?? undefined,
          _sale_day: saleDay,
        },
        "row",
      );
      p.stock -= quantity;
      const list = shop.salesBy.get(cashier) ?? [];
      list.push({ id: sale.id });
      shop.salesBy.set(cashier, list);

      if (onAccount && dueDate && customerId) {
        const [credit] = await rows<{ id: string }>(tx, "SELECT id FROM public.credits WHERE sale_id = $1", [sale.id]);
        planPayments({ id: credit.id, remaining: total - deposit, customerId }, day, dueDate, shop.today, rng, shop.payments);
      }
    });
  }
}

/** When (and how much) a credit gets paid: most are settled, some partly, a few left overdue. */
function planPayments(credit: CreditState, day: string, due: string, today: string, rng: Random, plans: Map<string, PaymentPlan[]>) {
  const add = (on: string, share: PaymentPlan["share"]) => {
    if (on >= today || on <= day) return;
    plans.set(on, [...(plans.get(on) ?? []), { credit, share }]);
  };
  const span = Math.max(1, Math.round((Date.parse(due) - Date.parse(day)) / 86_400_000));
  const roll = rng.next();
  if (due < today) {
    if (roll < 0.72) {
      if (rng.chance(0.4)) add(addDaysToKey(day, Math.ceil(span / 2)), 0.5);
      add(addDaysToKey(day, rng.int(Math.ceil(span / 2) + 1, span + 5)), "full");
    } else if (roll < 0.86) {
      add(addDaysToKey(day, rng.int(1, span)), 0.4);
    }
    // else: nothing paid → overdue
  } else if (roll < 0.35) {
    add(addDaysToKey(day, rng.int(1, span)), 0.5);
  }
}

/** A staff request on one of their own recent sales; optionally reviewed by the admin. */
async function requestChange(
  tx: Transaction,
  setUser: SetUser,
  sales: Array<{ id: string }> | undefined,
  adminId: string,
  requesterId: string,
  review: "approve" | "send_back" | null,
) {
  const recent = (sales ?? []).slice(-6);
  if (!recent.length) return;
  const requests: Array<[Record<string, unknown>, string]> =
    review === null
      ? [
          [{ quantity: 3 }, "Customer came back for one more"],
          [{ payment_method: "mpesa" }, "Paid by M-Pesa, I picked cash by mistake"],
          [{ description: "Delivered to Kibanda Hotel" }, "Adding delivery details"],
        ]
      : [[review === "approve" ? { quantity: 2 } : { selling_price: 150 }, review === "approve" ? "Counted wrong at the till" : "Gave a discount"]];
  for (const [index, [values, reason]] of requests.entries()) {
    const sale = recent[recent.length - 1 - index];
    if (!sale) break;
    await setUser(requesterId);
    let request: { id: string };
    try {
      await tx.exec("SAVEPOINT request");
      request = await callRpc<{ id: string }>(tx, "submit_change", { _table: "sales", _record_id: sale.id, _new_values: values, _reason: reason }, "row");
      await tx.exec("RELEASE SAVEPOINT request");
    } catch {
      // e.g. "Nothing changed" when the sale already has that value: skip it.
      await tx.exec("ROLLBACK TO SAVEPOINT request");
      continue;
    }
    if (review) {
      await setUser(adminId);
      await callRpc(
        tx,
        "review_change",
        { _id: request.id, _decision: review, _note: review === "send_back" ? "Please add the M-Pesa code so I can check the discount." : undefined },
        "row",
      );
    }
  }
}

function expensesFor(day: string, offset: number, rng: Random) {
  const dom = dayOfMonth(day);
  const out: Array<{ category: string; description: string; amount: number; method: string }> = [];
  if (dom === 1) out.push({ category: "Rent", description: "Shop rent", amount: 12000, method: "bank_cheque" });
  if (dom === 28) out.push({ category: "Salaries & wages", description: "Wages – Brian and Grace", amount: 18000, method: "mpesa" });
  if (dom === 10) out.push({ category: "Utilities", description: "KPLC electricity tokens", amount: 2000 + rng.int(0, 8) * 100, method: "mpesa" });
  if (dom === 12) out.push({ category: "Utilities", description: "Water bill", amount: 600, method: "mpesa" });
  if (dom === 15) out.push({ category: "Supplies", description: "Carrier bags and receipt rolls", amount: 1200, method: "cash" });
  if (weekday(day) === 1) out.push({ category: "Transport", description: "Delivery from wholesaler", amount: 600 + rng.int(0, 4) * 100, method: "cash" });
  if (offset === 40) out.push({ category: "Licences & fees", description: "County single business permit", amount: 4500, method: "mpesa" });
  if (offset === 63) out.push({ category: "Repairs", description: "Fridge repair", amount: 1800, method: "cash" });
  return out;
}

// ---------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------

async function clock(db: PGlite): Promise<string> {
  const [{ t }] = await rows<{ t: string }>(db, "SELECT clock_timestamp() AS t");
  return t;
}

/** The real-time span just used, and the business hours of `day` it stands for. */
async function window(db: PGlite, realFrom: string, day: string, now: Date): Promise<Window> {
  const midnight = Date.parse(startOfDayUtc(day, DEMO_TIME_ZONE));
  const opens = midnight + 8 * HOUR_MS;
  // Today: never later than "now" (and never before midnight, early in the morning).
  const closes = Math.max(midnight + 60_000, Math.min(opens + 11 * HOUR_MS, now.getTime() - 60_000));
  const simFrom = Math.max(midnight, Math.min(opens, closes - HOUR_MS));
  return { realFrom, realTo: await clock(db), simFrom, simTo: closes };
}

/** Map every timestamp written during each window onto that day's business hours. */
async function backdate(db: PGlite, windows: Window[], firstDay: string) {
  const columns = await rows<{ table_name: string; column_name: string }>(
    db,
    `SELECT table_name, column_name FROM information_schema.columns c
     WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'
       AND column_name NOT IN ('expires_at', 'trial_ends_at')
       AND EXISTS (SELECT 1 FROM information_schema.tables t
                   WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE')`,
  );
  await db.transaction(async (tx) => {
    // Plain data fix-up: no audit rows, no updated_at triggers.
    await tx.exec("SET LOCAL session_replication_role = replica");
    await tx.exec(`CREATE TEMP TABLE seed_windows (real_from timestamptz, real_to timestamptz, sim_from timestamptz, scale float8) ON COMMIT DROP`);
    for (const w of windows) {
      const realSpan = Math.max(1, Date.parse(w.realTo) - Date.parse(w.realFrom));
      await tx.query("INSERT INTO seed_windows VALUES ($1, $2, $3, $4)", [
        w.realFrom,
        w.realTo,
        new Date(w.simFrom).toISOString(),
        (w.simTo - w.simFrom) / realSpan,
      ]);
    }
    for (const { table_name, column_name } of columns) {
      await tx.exec(
        `UPDATE public.${table_name} t
         SET ${column_name} = w.sim_from + make_interval(secs => extract(epoch FROM t.${column_name} - w.real_from) * w.scale)
         FROM seed_windows w
         WHERE t.${column_name} >= w.real_from AND t.${column_name} <= w.real_to`,
      );
    }
    // Earlier days' sales were stamped at local noon by record_sale; give them their
    // real time of day (same calendar day), and deposits the time of their sale.
    const cutoff = startOfDayUtc(firstDay, DEMO_TIME_ZONE);
    await tx.query(
      `UPDATE public.sales SET sale_date = created_at
       WHERE (sale_date AT TIME ZONE $1)::date = (created_at AT TIME ZONE $1)::date AND sale_date <> created_at AND sale_date >= $2`,
      [DEMO_TIME_ZONE, cutoff],
    );
    await tx.query(
      `UPDATE public.credit_payments cp SET paid_at = s.sale_date
       FROM public.credits c JOIN public.sales s ON s.id = c.sale_id
       WHERE cp.credit_id = c.id AND (cp.paid_at AT TIME ZONE $1)::date = (s.sale_date AT TIME ZONE $1)::date
         AND cp.paid_at <> s.sale_date AND extract(hour FROM cp.paid_at AT TIME ZONE $1) = 12 AND extract(minute FROM cp.paid_at AT TIME ZONE $1) = 0`,
      [DEMO_TIME_ZONE],
    );
  });
}
