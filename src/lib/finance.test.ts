import { describe, expect, it } from "vitest";
import {
  clampPayment,
  creditOutstanding,
  marginPct,
  pctChange,
  runRate,
  saleMoney,
  summarizeBy,
  summarizeCredits,
  summarizeSales,
  toCents,
} from "./finance";

describe("toCents", () => {
  it("rounds to whole cents and tolerates strings and junk", () => {
    expect(toCents(100.1)).toBe(10010);
    expect(toCents("99.90")).toBe(9990);
    expect(toCents(null)).toBe(0);
    expect(toCents(NaN)).toBe(0);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("saleMoney", () => {
  it("treats a sale without a credit as fully paid", () => {
    const m = saleMoney({ quantity: 2, selling_price: 150, total_price: 300, unit_cost: 100 });
    expect(m).toMatchObject({ billed: 30000, collected: 30000, outstanding: 0, profit: 10000, status: "paid" });
  });

  it("splits a part-paid credit into collected and outstanding", () => {
    const m = saleMoney({
      quantity: 1,
      selling_price: 100.1,
      total_price: 100.1,
      unit_cost: 50,
      credit: { amount_owed: 100.1, amount_paid: 0.2 },
    });
    expect(m.outstanding).toBe(9990);
    expect(m.collected).toBe(20);
    expect(m.billed).toBe(m.collected + m.outstanding);
    expect(m.status).toBe("partial");
    expect(m.realizedProfit + m.pendingProfit).toBe(m.profit);
  });

  it("clamps overpaid or inconsistent credits so billed = collected + outstanding", () => {
    const over = saleMoney({ quantity: 1, selling_price: 100, credit: { amount_owed: 100, amount_paid: 150 } });
    expect(over).toMatchObject({ outstanding: 0, collected: 10000, status: "paid" });
    const owedMore = saleMoney({ quantity: 1, selling_price: 100, credit: { amount_owed: 500, amount_paid: 0 } });
    expect(owedMore).toMatchObject({ outstanding: 10000, collected: 0, status: "unpaid" });
  });

  it("falls back to quantity × price when total_price is missing", () => {
    expect(saleMoney({ quantity: 3, selling_price: "10.50" }).billed).toBe(3150);
  });
});

describe("summarizeSales", () => {
  const sales = [
    { quantity: 1, selling_price: 100, unit_cost: 60 },
    { quantity: 2, selling_price: 50, unit_cost: 30, credit: { amount_owed: 100, amount_paid: 40 } },
    { quantity: 1, selling_price: 80, unit_cost: 50, credit: { amount_owed: 80, amount_paid: 0 } },
  ];

  it("keeps billed = collected + outstanding for the total", () => {
    const t = summarizeSales(sales);
    expect(t.billed).toBe(28000);
    expect(t.collected + t.outstanding).toBe(t.billed);
    expect(t.outstanding).toBe(6000 + 8000);
    expect([t.paidCount, t.partialCount, t.unpaidCount]).toEqual([1, 1, 1]);
    expect(t.average).toBe(Math.round(28000 / 3));
  });

  it("groups by key with the same maths", () => {
    const groups = summarizeBy(sales, (s) => (s.credit ? "credit" : "cash"));
    expect(groups.get("cash")?.billed).toBe(10000);
    expect(groups.get("credit")?.billed).toBe(18000);
  });
});

describe("credits", () => {
  it("never reports negative outstanding", () => {
    expect(creditOutstanding({ amount_owed: 10, amount_paid: 12 })).toBe(0);
    expect(summarizeCredits([{ amount_owed: 10, amount_paid: 12 }, { amount_owed: 5, amount_paid: 1 }])).toEqual({
      count: 2,
      owed: 1500,
      paid: 1100,
      outstanding: 400,
    });
  });
});

describe("clampPayment", () => {
  it("keeps deposits between 0 and the total", () => {
    expect(clampPayment(50000, 30000)).toBe(30000);
    expect(clampPayment(-5, 30000)).toBe(0);
  });
});

describe("pctChange", () => {
  it("reads recovery from a loss as a gain", () => {
    expect(pctChange(50, -100)).toBe(150);
    expect(pctChange(-50, 100)).toBe(-150);
  });
  it("has no baseline when the previous period was zero", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("runRate", () => {
  it("projects an unfinished period and leaves a finished one alone", () => {
    expect(runRate(1000, 10, 30)).toBe(3000);
    expect(runRate(1000, 30, 30)).toBe(1000);
    expect(runRate(1000, 0, 30)).toBe(0);
  });
});

describe("marginPct", () => {
  it("is profit over revenue", () => {
    expect(marginPct(2500, 10000)).toBe(25);
    expect(marginPct(10, 0)).toBeNull();
  });
});
