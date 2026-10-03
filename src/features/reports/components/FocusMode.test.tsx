import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FocusMode } from "./FocusMode";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Focus mode
      </button>
      {open && (
        <FocusMode title="Trends" onClose={() => setOpen(false)}>
          <p>report body</p>
        </FocusMode>
      )}
    </>
  );
}

describe("FocusMode", () => {
  it("opens full screen, closes on Esc and returns focus", () => {
    render(<Harness />);
    const trigger = screen.getByText("Focus mode");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Trends" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close focus mode" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
