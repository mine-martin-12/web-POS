// @vitest-environment node
//
// Reset throws the visitor's changes away; exit also leaves demo mode.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isDemoMode, setDemoMode } from "@/data/mode";
import { recordSale, fetchSales } from "@/features/sales/api";
import { fetchProducts } from "@/features/products/api";

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  // No shipped history in tests: the demo builds the shop itself.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
});

const MARK = "made during this demo session";

async function addMarkedSale() {
  const [product] = (await fetchProducts()).filter((p) => p.stock_quantity > 0);
  await recordSale({
    productId: product.id,
    quantity: 1,
    sellingPrice: 100,
    paymentType: "paid",
    paymentMethod: "cash",
    deposit: 0,
    dueDate: null,
    customerId: null,
    saleDay: null,
    description: MARK,
  });
}

const markedSales = async () => (await fetchSales()).filter((s) => s.description === MARK);

describe("demo session", () => {
  it("reset throws away the visitor's changes", async () => {
    setDemoMode(true);
    const demo = await import("./session");
    await demo.startDemo();
    await addMarkedSale();
    expect(await markedSales()).toHaveLength(1);

    await demo.resetDemo();
    await demo.startDemo(); // what the page reload after Reset does
    expect(isDemoMode()).toBe(true);
    expect(await markedSales()).toHaveLength(0);
  }, 300_000);

  it("exit leaves demo mode and stops answering", async () => {
    const demo = await import("./session");
    await demo.exitDemo();
    expect(isDemoMode()).toBe(false);
    setDemoMode(true);
    expect(() => fetchSales()).toThrow(/still loading/);
    setDemoMode(false);
  });
});
