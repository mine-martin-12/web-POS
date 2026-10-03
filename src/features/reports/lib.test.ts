import { describe, expect, it } from "vitest";
import type { SaleRow } from "@/features/sales/types";
import { agingBuckets, pointsChange, receivedByMethod, totalsBy } from "./lib";

describe("agingBuckets", () => {
  const today = "2026-10-31";
  it("buckets open balances by days overdue and skips paid credits", () => {
    const buckets = agingBuckets(
      [
        { due_date: "2026-11-05", amount_owed: 100, amount_paid: 0, status: "unpaid" }, // not yet due
        { due_date: "2026-10-31", amount_owed: 50, amount_paid: 10, status: "partially_paid" }, // due today
        { due_date: "2026-10-30", amount_owed: 20, amount_paid: 0, status: "unpaid" }, // 1 day
        { due_date: "2026-08-31", amount_owed: 70, amount_paid: 0, status: "unpaid" }, // 61 days
        { due_date: "2026-01-01", amount_owed: 30, amount_paid: 0, status: "unpaid" }, // 90+
        { due_date: "2026-01-01", amount_owed: 30, amount_paid: 30, status: "paid" },
      ],
      today,
    );
    expect(buckets.map((b) => [b.key, b.cents, b.count])).toEqual([
      ["current", 14000, 2],
      ["1-30", 2000, 1],
      ["31-60", 0, 0],
      ["61-90", 7000, 1],
      ["90+", 3000, 1],
    ]);
  });
});

describe("receivedByMethod", () => {
  const sale = (partial: Partial<SaleRow>) => ({ total_price: 100, payment_method: "cash", credit: null, ...partial }) as SaleRow;
  it("counts upfront sales and credit payments without double-counting deposits", () => {
    const totals = receivedByMethod(
      [
        sale({ payment_method: "mpesa" }),
        sale({ payment_method: "cash", credit: { id: "c", amount_owed: 100, amount_paid: 40, status: "partially_paid", due_date: "", customer_name: "" } }),
        sale({ payment_method: "credit", credit: { id: "d", amount_owed: 100, amount_paid: 0, status: "unpaid", due_date: "", customer_name: "" } }),
      ],
      [
        { amount: 40, payment_method: "cash" }, // the deposit
        { amount: "25.50", payment_method: "bank_cheque" },
      ],
    );
    expect(totals).toEqual({ cash: 4000, mpesa: 10000, bank_cheque: 2550 });
  });
});

describe("totalsBy", () => {
  it("groups and sorts largest first", () => {
    expect(totalsBy([{ k: "a", v: 1 }, { k: "b", v: 5 }, { k: "a", v: 2 }], (r) => r.k, (r) => r.v)).toEqual([
      { key: "b", cents: 5, count: 1 },
      { key: "a", cents: 3, count: 2 },
    ]);
  });
});

describe("pointsChange", () => {
  it("compares margins in percentage points", () => {
    expect(pointsChange(25, 20)).toBe(5);
    expect(pointsChange(null, 20)).toBeNull();
  });
});
