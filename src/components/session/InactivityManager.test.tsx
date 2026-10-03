import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CONFIG } from "@/config/session";
import { InactivityManager } from "./InactivityManager";

const signOut = vi.fn(async () => {});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, signOut }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

const MIN = 60_000;

describe("InactivityManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T08:00:00Z"));
    localStorage.clear();
    signOut.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns at 15 minutes with a countdown, then signs out at 20", async () => {
    render(<InactivityManager />);
    await act(async () => vi.advanceTimersByTime(14 * MIN));
    expect(screen.queryByText("Are you still there?")).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(1 * MIN + 1000));
    expect(screen.getByText("Are you still there?")).toBeInTheDocument();
    expect(screen.getByText(/4:5\d/)).toBeInTheDocument();

    // Passive activity does not dismiss the warning.
    fireEvent.mouseDown(document.body);
    expect(screen.getByText("Are you still there?")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(5 * MIN));
    expect(signOut).toHaveBeenCalledWith({ silent: true });
  });

  it("'Stay logged in' resets the timer", async () => {
    render(<InactivityManager />);
    await act(async () => vi.advanceTimersByTime(16 * MIN));
    fireEvent.click(screen.getByText("Stay logged in"));
    await act(async () => vi.advanceTimersByTime(10 * MIN));
    expect(screen.queryByText("Are you still there?")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("activity in another tab keeps this tab alive", async () => {
    render(<InactivityManager />);
    await act(async () => vi.advanceTimersByTime(14 * MIN));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: SESSION_CONFIG.storageKey, newValue: String(Date.now()) }),
      );
    });
    await act(async () => vi.advanceTimersByTime(10 * MIN));
    expect(screen.queryByText("Are you still there?")).not.toBeInTheDocument();
  });

  it("signs out immediately on load if the stored activity is past the limit", async () => {
    localStorage.setItem(SESSION_CONFIG.storageKey, String(Date.now() - 21 * MIN));
    render(<InactivityManager />);
    await act(async () => {});
    expect(signOut).toHaveBeenCalled();
  });
});
