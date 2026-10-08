import { describe, expect, it } from "vitest";
import { comparisonPeriod, resolvePeriod } from "./period";

const today = "2026-10-03";

describe("resolvePeriod", () => {
  it("defaults to the current month", () => {
    expect(resolvePeriod({}, today)).toMatchObject({ kind: "month", from: "2026-10-01", to: "2026-10-31", month: "2026-10", label: "October 2026" });
  });

  it("browses any month", () => {
    expect(resolvePeriod({ month: "2026-02" }, today)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("resolves presets inclusively", () => {
    expect(resolvePeriod({ period: "7d" }, today)).toMatchObject({ from: "2026-09-27", to: "2026-10-03" });
    expect(resolvePeriod({ period: "today" }, today)).toMatchObject({ from: today, to: today });
  });

  it("accepts a custom range in either order and ignores junk", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-09-10", to: "2026-09-01" }, today)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-10",
    });
    expect(resolvePeriod({ period: "custom", from: "nope", to: "2026-09-01" }, today).kind).toBe("month");
  });
});

describe("comparisonPeriod (fair comparisons)", () => {
  const month = (m: string, day: string) => comparisonPeriod(resolvePeriod({ month: m }, day), day);

  it("compares a month in progress with the same days of the previous month", () => {
    expect(month("2026-10", "2026-10-08")).toEqual({ from: "2026-09-01", to: "2026-09-08", label: "vs 1–8 Sep" });
  });

  it("stops at the end of a shorter previous month", () => {
    expect(month("2026-03", "2026-03-31")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("compares a finished month with the whole previous month", () => {
    expect(month("2026-09", "2026-10-08")).toEqual({ from: "2026-08-01", to: "2026-08-31", label: "vs August" });
    expect(month("2026-01", "2026-10-08")).toMatchObject({ from: "2025-12-01", to: "2025-12-31", label: "vs December 2025" });
  });

  it("compares a custom range with the same number of days just before it", () => {
    const period = resolvePeriod({ period: "custom", from: "2026-09-10", to: "2026-09-19" }, "2026-10-08");
    expect(comparisonPeriod(period, "2026-10-08")).toEqual({ from: "2026-08-31", to: "2026-09-09", label: "vs 31 Aug – 9 Sep" });
  });

  it("compares today with yesterday, and last N days with the N before", () => {
    expect(comparisonPeriod(resolvePeriod({ period: "today" }, "2026-10-08"), "2026-10-08")).toEqual({
      from: "2026-10-07",
      to: "2026-10-07",
      label: "vs yesterday",
    });
    expect(comparisonPeriod(resolvePeriod({ period: "30d" }, "2026-10-08"), "2026-10-08")).toEqual({
      from: "2026-08-10",
      to: "2026-09-08",
      label: "vs previous 30 days",
    });
  });
});
