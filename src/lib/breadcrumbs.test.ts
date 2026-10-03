import { describe, expect, it } from "vitest";
import { buildCrumbs } from "./breadcrumbs";

describe("buildCrumbs", () => {
  it("starts at the dashboard", () => {
    expect(buildCrumbs("/app")).toEqual([{ label: "Dashboard", to: "/app" }]);
  });

  it("uses registered page titles", () => {
    expect(buildCrumbs("/app/staff").map((c) => c.label)).toEqual(["Dashboard", "Team"]);
  });

  it("shows record ids as Edit", () => {
    expect(buildCrumbs("/app/sales/6f1c2a9e-1111-4222-8333-944455556666").map((c) => c.label)).toEqual([
      "Dashboard",
      "Sales",
      "Edit",
    ]);
  });
});
