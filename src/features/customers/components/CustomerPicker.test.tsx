import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, PickerMode } from "../types";
import { CustomerPicker } from "./CustomerPicker";

const calls: Array<{ mode: PickerMode; term: string }> = [];
const wanjiku: Customer = {
  id: "c1",
  name: "Wanjiku Kamau",
  phone: "+2547123***78",
  notes: null,
  created_at: "2026-10-01T00:00:00Z",
  archived_at: null,
};

vi.mock("../hooks", () => ({
  useCustomerSearch: (mode: PickerMode, term: string) => {
    calls.push({ mode, term });
    return { data: mode === "keep-typing" ? [] : [wanjiku], isFetching: false };
  },
  useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useSecurity", () => ({ useSecurity: () => ({ canViewCustomerPhone: false }) }));

beforeAll(() => {
  // cmdk scrolls the active item into view; jsdom doesn't implement it.
  Element.prototype.scrollIntoView = vi.fn();
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("CustomerPicker", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
  });

  const open = (onChange = vi.fn()) => {
    render(<CustomerPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    return onChange;
  };

  it("shows recent customers when empty, with the mode and count", () => {
    open();
    expect(screen.getByText("Recent customers")).toBeInTheDocument();
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getByText("Wanjiku Kamau")).toBeInTheDocument();
    expect(screen.getByText("Walk-in / guest")).toBeInTheDocument();
  });

  it("debounces typing by 250ms, then searches by name", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Name or phone number…"), { target: { value: "wan" } });
    expect(calls.some((c) => c.mode === "name")).toBe(false);
    await act(async () => vi.advanceTimersByTime(260));
    expect(calls.at(-1)).toEqual({ mode: "name", term: "wan" });
    expect(screen.getByText("Name search")).toBeInTheDocument();
    expect(screen.getByText('Create new "wan"')).toBeInTheDocument();
  });

  it("asks to keep typing for a partial phone number", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Name or phone number…"), { target: { value: "0712" } });
    await act(async () => vi.advanceTimersByTime(260));
    expect(screen.getByText("Keep typing the phone number…")).toBeInTheDocument();
  });

  it("selects a customer or a walk-in", () => {
    const onChange = open();
    fireEvent.click(screen.getByText("Wanjiku Kamau"));
    expect(onChange).toHaveBeenCalledWith({ kind: "customer", customer: wanjiku });
  });
});
