// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDb, rows } from "./harness";

describe("migrations", () => {
  it("apply cleanly on an empty database", async () => {
    const db = await createDb();
    const tables = await rows<{ tablename: string }>(
      db,
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    expect(tables.map((t) => t.tablename)).toEqual(
      expect.arrayContaining(["businesses", "user_roles", "profiles", "products", "sales", "credits", "invitations", "credit_payments"]),
    );
  }, 60_000);
});
