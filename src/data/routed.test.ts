import { afterEach, describe, expect, it, vi } from "vitest";
import { setDemoMode } from "./mode";
import { installDemoApi, routed } from "./routed";
import type { DataApi } from "./types";

const remote = { fetchSales: vi.fn(async () => ["remote"]) };
const demo = { fetchSales: vi.fn(async () => ["demo"]) };
const api = routed("sales", remote as unknown as DataApi["sales"]) as unknown as typeof remote;

afterEach(() => {
  setDemoMode(false);
  installDemoApi(null);
  vi.clearAllMocks();
});

describe("routed backend calls", () => {
  it("call Supabase outside demo mode", async () => {
    installDemoApi({ sales: demo } as unknown as DataApi);
    expect(await api.fetchSales()).toEqual(["remote"]);
    expect(demo.fetchSales).not.toHaveBeenCalled();
  });

  it("call the demo in demo mode, never Supabase", async () => {
    setDemoMode(true);
    installDemoApi({ sales: demo } as unknown as DataApi);
    expect(await api.fetchSales()).toEqual(["demo"]);
    expect(remote.fetchSales).not.toHaveBeenCalled();
  });

  it("refuse (rather than fall back to Supabase) while the demo is loading", () => {
    setDemoMode(true);
    expect(() => api.fetchSales()).toThrow(/still loading/);
    expect(remote.fetchSales).not.toHaveBeenCalled();
  });
});
