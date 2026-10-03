import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./period";

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
