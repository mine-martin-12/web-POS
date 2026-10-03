import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { optimisticListUpdate } from "./optimistic";

describe("optimisticListUpdate", () => {
  it("updates every cached list under the key at once and rolls back exactly", async () => {
    const client = new QueryClient();
    client.setQueryData(["sales", "range", "a"], [{ id: 1, paid: false }, { id: 2, paid: false }]);
    client.setQueryData(["sales", "range", "b"], [{ id: 1, paid: false }]);
    client.setQueryData(["sales", "months"], { not: "a list" });

    const rollback = await optimisticListUpdate<{ id: number; paid: boolean }>(client, ["sales"], (rows) =>
      rows.map((r) => (r.id === 1 ? { ...r, paid: true } : r)),
    );
    expect(client.getQueryData(["sales", "range", "a"])).toEqual([{ id: 1, paid: true }, { id: 2, paid: false }]);
    expect(client.getQueryData(["sales", "range", "b"])).toEqual([{ id: 1, paid: true }]);
    expect(client.getQueryData(["sales", "months"])).toEqual({ not: "a list" });

    rollback();
    expect(client.getQueryData(["sales", "range", "a"])).toEqual([{ id: 1, paid: false }, { id: 2, paid: false }]);
    expect(client.getQueryData(["sales", "range", "b"])).toEqual([{ id: 1, paid: false }]);
  });
});
