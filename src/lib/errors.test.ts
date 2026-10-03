import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("reads Error instances", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });
  it("reads plain objects with a message (Supabase PostgrestError)", () => {
    expect(getErrorMessage({ message: "denied", code: "42501" })).toBe("denied");
  });
  it("falls back for unknown values", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage({}, "fallback")).toBe("fallback");
  });
});
