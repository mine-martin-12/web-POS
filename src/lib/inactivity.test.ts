import { describe, expect, it } from "vitest";
import { formatCountdown, inactivityState, clearStoredActivity, sessionActivity, writeStoredActivity } from "./inactivity";

const config = { warnAfterMs: 15 * 60_000, signOutAfterMs: 20 * 60_000 };
const t0 = 1_700_000_000_000;

describe("inactivityState", () => {
  it("is active before the warning threshold", () => {
    expect(inactivityState(t0 + 14 * 60_000, t0, config)).toEqual({ phase: "active", remainingMs: 6 * 60_000 });
  });

  it("warns from 15 minutes with the time left until sign-out", () => {
    expect(inactivityState(t0 + 15 * 60_000, t0, config)).toEqual({ phase: "warning", remainingMs: 5 * 60_000 });
  });

  it("expires at 20 minutes", () => {
    expect(inactivityState(t0 + 20 * 60_000, t0, config)).toEqual({ phase: "expired", remainingMs: 0 });
  });

  it("treats activity in the future (clock skew between tabs) as just now", () => {
    expect(inactivityState(t0, t0 + 5_000, config).phase).toBe("active");
  });
});

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(5 * 60_000)).toBe("5:00");
    expect(formatCountdown(65_400)).toBe("1:06");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("sessionActivity", () => {
  const signIn = "2026-10-05T08:00:00Z";
  const at = (iso: string) => Date.parse(iso);

  it("keeps activity from the current session", () => {
    expect(sessionActivity(at("2026-10-05T08:10:00Z"), signIn)).toBe(at("2026-10-05T08:10:00Z"));
  });
  it("drops activity from before the latest sign-in", () => {
    expect(sessionActivity(at("2026-10-04T18:00:00Z"), signIn)).toBeNull();
  });
  it("keeps activity when the sign-in time is unknown", () => {
    expect(sessionActivity(5, null)).toBe(5);
    expect(sessionActivity(5, "not a date")).toBe(5);
  });
  it("clearStoredActivity forgets the timestamp", () => {
    writeStoredActivity(123);
    clearStoredActivity();
    expect(localStorage.getItem("smartpos:last-activity")).toBeNull();
  });
});
