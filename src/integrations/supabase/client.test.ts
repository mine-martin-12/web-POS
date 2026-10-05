import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoLeakError, setDemoMode } from "@/data/mode";

const createClient = vi.hoisted(() => vi.fn(() => ({ from: vi.fn(() => "query") })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { supabase } = await import("./client");

afterEach(() => setDemoMode(false));

describe("Supabase client guard", () => {
  it("throws on any use in demo mode and never creates the client", () => {
    setDemoMode(true);
    expect(() => supabase.from("sales")).toThrow(DemoLeakError);
    expect(() => supabase.auth).toThrow(/demo mode \(supabase\.auth\)/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates the real client lazily, once, outside demo mode", () => {
    expect(supabase.from("sales" as never)).toBe("query");
    supabase.from("credits" as never);
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
