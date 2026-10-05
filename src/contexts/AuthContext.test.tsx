import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CONFIG } from "@/config/session";
import { AuthProvider, useAuth } from "./AuthContext";

type Listener = (event: string, session: unknown) => void;

const mocks = vi.hoisted(() => ({
  listener: null as Listener | null,
  session: null as null | { user: { id: string }; access_token: string },
  /** Resolves/rejects the pending profiles query. */
  settle: null as null | { resolve: (v: unknown) => void; reject: (e: unknown) => void },
  queries: 0,
  signals: [] as AbortSignal[],
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    abortSignal: (signal: AbortSignal) => {
      mocks.signals.push(signal);
      return query;
    },
    maybeSingle: () => {
      mocks.queries += 1;
      return new Promise((resolve, reject) => {
        mocks.settle = { resolve, reject };
      });
    },
  };
  return {
    supabase: {
      from: () => query,
      auth: {
        onAuthStateChange: (cb: Listener) => {
          mocks.listener = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
        getSession: async () => ({ data: { session: mocks.session } }),
        signInWithPassword: async () => ({ error: null }),
        signOut: async () => {
          mocks.session = null;
          mocks.listener?.("SIGNED_OUT", null);
          return { error: null };
        },
      },
    },
  };
});

const USER = { id: "u1" };
let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

async function signedIn() {
  mocks.session = { user: USER, access_token: "t1" };
  await act(async () => mocks.listener?.("SIGNED_IN", mocks.session));
  await act(async () => vi.runOnlyPendingTimers());
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.session = null;
    mocks.settle = null;
    mocks.queries = 0;
    mocks.signals = [];
    mocks.toastError.mockClear();
    localStorage.clear();
  });

  it("drops an account load cancelled by sign-out without an error toast", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await signedIn();
    await waitFor(() => expect(mocks.queries).toBe(1));

    await act(async () => auth.signOut({ silent: true }));
    expect(mocks.signals[0].aborted).toBe(true);
    // The request now fails (as anon / aborted): nobody should hear about it.
    await act(async () => mocks.settle?.reject({ message: "permission denied for table profiles" }));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(auth.profile).toBeNull();
    expect(auth.isLoadingRole).toBe(false);
  });

  it("does not query profiles without a session for that user", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    // The event says signed in, but by the time the load runs the session is gone.
    await act(async () => mocks.listener?.("SIGNED_IN", { user: USER, access_token: "t1" }));
    await act(async () => vi.runOnlyPendingTimers());
    expect(mocks.queries).toBe(0);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("still reports a real failure while signed in", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await signedIn();
    await waitFor(() => expect(mocks.queries).toBe(1));
    await act(async () => mocks.settle?.reject({ message: "boom" }));
    expect(mocks.toastError).toHaveBeenCalledWith("Couldn't load your account", { description: "boom" });
  });

  it("resets the idle timer on sign-in and clears it on sign-out", async () => {
    localStorage.setItem(SESSION_CONFIG.storageKey, "1");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => void (await auth.signIn("a@b.test", "pw")));
    expect(Number(localStorage.getItem(SESSION_CONFIG.storageKey))).toBeGreaterThan(Date.now() - 1000);

    await act(async () => auth.signOut({ silent: true }));
    expect(localStorage.getItem(SESSION_CONFIG.storageKey)).toBeNull();
  });
});
