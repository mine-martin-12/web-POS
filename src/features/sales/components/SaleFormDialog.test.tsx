import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SaleFormDialog } from "./SaleFormDialog";

const recordSale = vi.fn();
vi.mock("../hooks", () => ({
  useRecordSale: () => ({ mutateAsync: recordSale, isPending: false }),
  useUpdateSale: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/approvals/useRequestChange", () => ({
  useRequestChange: () => ({ request: vi.fn(), dialog: null }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ business: { currency: "KES", timezone: "Africa/Nairobi" } }),
}));
vi.mock("@/features/customers/components/CustomerPicker", () => ({
  CustomerPicker: () => <button type="button">customer picker</button>,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const renderForm = () =>
  render(<SaleFormDialog open onOpenChange={() => {}} products={[]} defaultMethod="mpesa" />);

describe("SaleFormDialog", () => {
  it("shows only what a paid sale needs, with sensible defaults", () => {
    renderForm();
    expect(screen.getByLabelText("Quantity")).toHaveValue(1);
    expect(screen.getByText("Paid by")).toBeInTheDocument();
    // Radix renders the visible value plus a hidden native <option>.
    expect(screen.getAllByText("M-Pesa").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Deposit paid now")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance due on")).not.toBeInTheDocument();
    expect(screen.getByText("Customer (optional)")).toBeInTheDocument();
  });

  it("asks for a deposit and due date on a part payment", () => {
    renderForm();
    fireEvent.click(screen.getByText("Part payment"));
    expect(screen.getByLabelText("Deposit paid now")).toBeInTheDocument();
    expect(screen.getByText("Balance due on")).toBeInTheDocument();
    expect(screen.getByText("Deposit paid by")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
  });

  it("drops the payment method for a full credit sale", () => {
    renderForm();
    fireEvent.click(screen.getByText("On credit"));
    expect(screen.queryByText("Paid by")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deposit paid now")).not.toBeInTheDocument();
    expect(screen.getByText("Balance due on")).toBeInTheDocument();
  });

  it("shows per-field errors and doesn't submit an incomplete sale", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Record sale"));
    expect(await screen.findByText("Choose a product")).toBeInTheDocument();
    expect(screen.getByText("Enter a whole number, at least 1")).toBeInTheDocument();
    expect(screen.getByText("Enter the price per item")).toBeInTheDocument();
    expect(recordSale).not.toHaveBeenCalled();
  });
});
