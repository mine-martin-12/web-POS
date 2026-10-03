import { describe, expect, it } from "vitest";
import { addDaysToKey, dayKey, daysInclusive, daysInMonth, eachDayKey, monthKey, startOfDayUtc } from "./dates";

describe("dayKey / monthKey", () => {
  it("uses the business time zone, not UTC", () => {
    // 21:30 UTC on 30 Sep is 00:30 on 1 Oct in Nairobi (UTC+3).
    expect(dayKey("2026-09-30T21:30:00Z", "Africa/Nairobi")).toBe("2026-10-01");
    expect(monthKey("2026-09-30T21:30:00Z", "Africa/Nairobi")).toBe("2026-10");
    expect(monthKey("2026-09-30T21:30:00Z", "UTC")).toBe("2026-09");
  });

  it("passes plain date strings through untouched", () => {
    expect(dayKey("2026-10-05")).toBe("2026-10-05");
    expect(monthKey("2026-10-05")).toBe("2026-10");
  });
});

describe("day arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts inclusive ranges (Last 7 days really is 7 days)", () => {
    expect(daysInclusive("2026-10-01", "2026-10-07")).toBe(7);
    expect(eachDayKey("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("knows month lengths", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
  });
});

describe("startOfDayUtc", () => {
  it("returns the UTC instant of local midnight", () => {
    expect(startOfDayUtc("2026-10-03", "Africa/Nairobi")).toBe("2026-10-02T21:00:00.000Z");
    expect(startOfDayUtc("2026-10-03", "UTC")).toBe("2026-10-03T00:00:00.000Z");
  });

  it("handles daylight-saving zones", () => {
    // London is on BST (UTC+1) in July.
    expect(startOfDayUtc("2026-07-01", "Europe/London")).toBe("2026-06-30T23:00:00.000Z");
  });
});
