import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import { TextField } from "./form-fields";

const schema = z.object({ email: z.string().email("Enter a valid email address"), password: z.string() });

function Harness() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    reValidateMode: "onSubmit",
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} noValidate>
        <TextField control={form.control} clearErrors={form.clearErrors} name="email" label="Email" type="email" />
        <TextField control={form.control} name="password" label="Password" type="password" />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

describe("TextField", () => {
  it("shows an inline error on submit and clears it as soon as the user types", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Submit"));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a" } });
    await waitFor(() => expect(screen.queryByText("Enter a valid email address")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });

  it("toggles password visibility with an accessible button", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});
