import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SMS_MAX_LENGTH } from "@/lib/smsTemplate";
import { MessageComposer } from "./MessageComposer";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MessageComposer value={value} onChange={setValue} templates={[]} sample={{ customer_name: "Wanjiku" }} />;
}

describe("MessageComposer", () => {
  it("previews placeholders with a sample customer", () => {
    render(<Harness initial="Hi {customer_name}, thanks {unknown}!" />);
    expect(screen.getByText("Hi Wanjiku, thanks!")).toBeInTheDocument();
  });

  it("turns the counter red at 90% of the limit", () => {
    render(<Harness initial={"x".repeat(Math.floor(SMS_MAX_LENGTH * 0.89))} />);
    const counter = screen.getByText(new RegExp(`/${SMS_MAX_LENGTH}`));
    expect(counter).not.toHaveClass("text-destructive");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "x".repeat(Math.ceil(SMS_MAX_LENGTH * 0.9)) } });
    expect(screen.getByText(new RegExp(`/${SMS_MAX_LENGTH}`))).toHaveClass("text-destructive");
  });

  it("inserts placeholder chips", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "{amount_due}" }));
    expect(screen.getByLabelText("Message")).toHaveValue("{amount_due}");
  });
});
