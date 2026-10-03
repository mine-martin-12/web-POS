import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "../api";
import { NotificationBell } from "./NotificationBell";

let list: Notification[] = [];
const markRead = vi.fn();
const resolveTarget = vi.fn();
const toastInfo = vi.fn();

vi.mock("../hooks", () => ({
  useNotifications: () => ({ data: list, isLoading: false }),
  useMarkRead: () => ({ mutate: markRead }),
  useArchiveNotification: () => ({ mutate: vi.fn() }),
}));
vi.mock("../api", () => ({ resolveTarget: (...args: unknown[]) => resolveTarget(...args) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ business: { timezone: "Africa/Nairobi" } }) }));
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => toastInfo(...args) } }));

const note = (id: string, read = false): Notification => ({
  id,
  business_id: "b",
  user_id: "u",
  kind: "credit_overdue",
  title: `Note ${id}`,
  body: null,
  link_table: "credits",
  link_id: "c1",
  read_at: read ? "2026-10-01T00:00:00Z" : null,
  archived_at: null,
  created_at: new Date().toISOString(),
});

const renderBell = () =>
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );

describe("NotificationBell", () => {
  beforeEach(() => {
    markRead.mockClear();
    resolveTarget.mockReset();
    toastInfo.mockClear();
  });

  it("shows an unread badge and 'All caught up' when empty", () => {
    list = [];
    renderBell();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });

  it("counts unread and marks all read", () => {
    list = [note("1"), note("2"), note("3", true)];
    renderBell();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    fireEvent.click(screen.getByText(/Mark all read/));
    expect(markRead).toHaveBeenCalledWith(["1", "2"]);
  });

  it("checks the record still exists before navigating", async () => {
    list = [note("1")];
    resolveTarget.mockResolvedValue(null);
    renderBell();
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    fireEvent.click(screen.getByText("Note 1"));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("This item no longer exists", expect.anything()));
    expect(markRead).toHaveBeenCalledWith(["1"]);
  });
});
