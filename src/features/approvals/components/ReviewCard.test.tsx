import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeRequest } from "../types";
import { ReviewCard } from "./ReviewCard";

const reviewChange = vi.fn(async () => ({}));
const toastError = vi.fn();
vi.mock("../hooks", () => ({
  useReviewChange: () => ({ mutateAsync: reviewChange, isPending: false }),
  useArchiveChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

const change: ChangeRequest = {
  id: "c1",
  table_name: "sales",
  record_id: "s1",
  old_values: { quantity: 3, selling_price: 50 },
  new_values: { quantity: 2, selling_price: 45 },
  reason: "Customer returned one",
  status: "pending",
  requested_by: "u2",
  requested_at: new Date().toISOString(),
  reviewed_by: null,
  reviewed_at: null,
  admin_note: null,
  archived_at: null,
};

const lookups = { currency: "KES", products: new Map(), customers: new Map() };

const renderCard = (props: Partial<React.ComponentProps<typeof ReviewCard>> = {}) =>
  render(
    <ReviewCard
      change={change}
      recordLabel="3 × Soap · 2 Oct"
      requester="Jane"
      lookups={lookups}
      canReview
      isMine={false}
      highlighted={false}
      onResubmit={vi.fn()}
      {...props}
    />,
  );

describe("ReviewCard", () => {
  beforeEach(() => {
    reviewChange.mockClear();
    toastError.mockClear();
  });

  it("shows the reason and a field-by-field diff", () => {
    renderCard();
    expect(screen.getByText("Customer returned one")).toBeInTheDocument();
    expect(screen.getByText("Quantity")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("KES 45.00")).toBeInTheDocument();
  });

  it("requires a note before sending back", async () => {
    renderCard();
    fireEvent.click(screen.getByText("Send back"));
    expect(toastError).toHaveBeenCalled();
    expect(reviewChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Note to Jane/), { target: { value: "Check the price" } });
    fireEvent.click(screen.getByText("Send back"));
    await waitFor(() =>
      expect(reviewChange).toHaveBeenCalledWith({ id: "c1", decision: "send_back", note: "Check the price" }),
    );
  });

  it("hides review buttons from people who can't review, and offers resubmit on sent-back requests", () => {
    const onResubmit = vi.fn();
    renderCard({
      canReview: false,
      isMine: true,
      onResubmit,
      change: { ...change, status: "sent_back_for_review", admin_note: "Check the price" },
    });
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Edit & resubmit/));
    expect(onResubmit).toHaveBeenCalled();
  });
});
