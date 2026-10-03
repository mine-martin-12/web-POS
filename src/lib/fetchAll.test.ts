import { describe, expect, it, vi } from "vitest";
import { fetchAll } from "./fetchAll";

function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const range = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
  return { range, make: () => ({ range }) };
}

describe("fetchAll", () => {
  it("keeps paging past the 1000-row cap until a short page", async () => {
    const table = fakeTable(2500);
    const rows = await fetchAll(table.make);
    expect(rows).toHaveLength(2500);
    expect(table.range).toHaveBeenCalledTimes(3);
  });

  it("asks once more when the total is an exact multiple of the page size", async () => {
    const table = fakeTable(2000);
    expect(await fetchAll(table.make)).toHaveLength(2000);
    expect(table.range).toHaveBeenCalledTimes(3);
  });

  it("throws the first error", async () => {
    const make = () => ({ range: async () => ({ data: null, error: new Error("denied") }) });
    await expect(fetchAll(make)).rejects.toThrow("denied");
  });
});
