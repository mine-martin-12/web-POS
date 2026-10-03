import { describe, expect, it } from "vitest";
import { buildMonthlySeries, expensesByMonth, greetingFor, lastMonths, seriesStats } from "./analytics";

describe("lastMonths", () => {
  it("counts back across the year boundary, oldest first", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("buildMonthlySeries", () => {
  const summary = [
    { month: "2026-09", sales_count: 10, billed: 1000, collected: 800, outstanding: 200, cost: 600 },
    { month: "2026-10", sales_count: 2, billed: 300, collected: 300, outstanding: 0, cost: 100 },
  ];
  const expenses = expensesByMonth([
    { expense_date: "2026-09-05", amount: 500 },
    { expense_date: "2026-10-01", amount: "50.50" },
  ]);
  const points = buildMonthlySeries(["2026-08", "2026-09", "2026-10"], summary, expenses, "2026-10-10");

  it("zero-fills months and computes net = revenue − cost − expenses", () => {
    expect(points.map((p) => p.net)).toEqual([0, -100, 149.5]);
    expect(points[0]).toMatchObject({ revenue: 0, expenses: 0 });
  });

  it("projects only the unfinished current month", () => {
    expect(points[1].projectedNet).toBeNull();
    expect(points[2].projectedNet).toBeCloseTo(463.45, 2); // 149.50 / 10 days × 31
  });

  it("summarises best month, average and profitable months over active months only", () => {
    expect(seriesStats(points)).toMatchObject({ profitable: 1, total: 2, averageNet: 24.75 });
    expect(seriesStats(points).best?.month).toBe("2026-10");
  });
});

describe("greetingFor", () => {
  it("follows the clock", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
  });
});
