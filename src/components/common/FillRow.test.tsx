import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FillRow } from "./FillRow";

describe("FillRow", () => {
  it("gives every card its own growing slot, fragments included", () => {
    const admin = true;
    const archived = false as boolean;
    render(
      <FillRow layout="xl-4" as="section" aria-label="Key figures">
        <p>Revenue</p>
        <p>Collected</p>
        {admin && (
          <>
            <p>Gross profit</p>
            <p>Net</p>
          </>
        )}
        {archived && <p>Hidden</p>}
      </FillRow>,
    );
    const row = screen.getByRole("region", { name: "Key figures" });
    const slots = [...row.children];
    expect(slots.map((s) => s.textContent)).toEqual(["Revenue", "Collected", "Gross profit", "Net"]);
    // Each slot grows, so a shorter last row stretches to the right edge.
    for (const slot of slots) expect(slot.className).toMatch(/\bgrow\b/);
  });

  it("wraps items in list items when rendered as a list", () => {
    render(
      <FillRow layout="lg-4" as="ul">
        <span>September</span>
        <span>August</span>
      </FillRow>,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["September", "August"]);
  });
});
