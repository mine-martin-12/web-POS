import { describe, expect, it } from "vitest";
import { subscriptionState } from "./subscription";

const now = new Date("2026-10-03T12:00:00Z");

describe("subscriptionState", () => {
  it("counts trial days left, rounding up", () => {
    const s = subscriptionState({ account_status: "trial", trial_ends_at: "2026-10-05T11:00:00Z" }, now);
    expect(s).toMatchObject({ status: "trial", active: true, daysLeft: 2 });
  });

  it("treats a finished trial as inactive", () => {
    const s = subscriptionState({ account_status: "trial", trial_ends_at: "2026-10-03T11:59:00Z" }, now);
    expect(s).toMatchObject({ active: false, daysLeft: 0 });
  });

  it.each([
    ["active", true],
    ["expired", false],
    ["suspended", false],
  ])("%s accounts are active=%s", (status, active) => {
    expect(subscriptionState({ account_status: status, trial_ends_at: null }, now).active).toBe(active);
  });
});
