import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SESSION_CONFIG } from "@/config/session";
import { formatCountdown, inactivityState, readStoredActivity, sessionActivity, writeStoredActivity } from "@/lib/inactivity";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Signs out idle sessions. Mounted once at the root; inert while signed out.
 * - Any mouse/key/scroll/touch/click counts as activity.
 * - Warns with a countdown (can't be dismissed) at warnAfterMs; signs out at signOutAfterMs.
 * - Last activity is shared across tabs through localStorage (throttled writes + the
 *   `storage` event), so activity in one tab keeps every tab alive.
 * - On load, a session already idle past the limit is signed out immediately.
 */
export function InactivityManager() {
  const { user, signOut } = useAuth();
  // Key on the id: the user object changes identity on every token refresh, which must
  // not count as activity.
  const userId = user?.id ?? null;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const lastPersisted = useRef(0);
  const warning = remainingMs !== null;
  const warningRef = useRef(false);
  warningRef.current = warning;

  const expire = useCallback(async () => {
    setRemainingMs(null);
    await signOut({ silent: true });
    toast.info("Signed out for your security", { description: "You were inactive for a while. Please sign in again." });
  }, [signOut]);

  const markActive = useCallback((force = false) => {
    const now = Date.now();
    lastActivity.current = now;
    if (force || now - lastPersisted.current >= SESSION_CONFIG.persistEveryMs) {
      lastPersisted.current = now;
      writeStoredActivity(now);
    }
  }, []);

  // Start of a signed-in session: a reload after a long idle spell signs out, but a
  // timestamp left over from before this sign-in is ignored.
  const lastSignInAt = user?.last_sign_in_at ?? null;
  const lastSignInRef = useRef(lastSignInAt);
  lastSignInRef.current = lastSignInAt;
  useEffect(() => {
    if (!userId) return;
    const stored = sessionActivity(readStoredActivity(), lastSignInRef.current);
    if (stored !== null && inactivityState(Date.now(), stored).phase === "expired") {
      void expire();
      return;
    }
    markActive(true);
  }, [userId, expire, markActive]);

  // Activity listeners. While the warning is showing, only "Stay logged in" counts.
  useEffect(() => {
    if (!userId) return;
    const onActivity = () => {
      if (!warningRef.current) markActive();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_CONFIG.storageKey || !event.newValue) return;
      const time = Number(event.newValue);
      if (Number.isFinite(time) && time > lastActivity.current) {
        lastActivity.current = time;
        // Another tab chose "Stay logged in" (or is in use): close our warning too.
        if (inactivityState(Date.now(), time).phase === "active") setRemainingMs(null);
      }
    };
    for (const name of SESSION_CONFIG.activityEvents) {
      window.addEventListener(name, onActivity, { passive: true, capture: true });
    }
    window.addEventListener("storage", onStorage);
    return () => {
      for (const name of SESSION_CONFIG.activityEvents) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, markActive]);

  // The clock.
  useEffect(() => {
    if (!userId) {
      setRemainingMs(null);
      return;
    }
    const timer = window.setInterval(() => {
      const state = inactivityState(Date.now(), lastActivity.current);
      if (state.phase === "expired") void expire();
      else if (state.phase === "warning") setRemainingMs(state.remainingMs);
      else if (warningRef.current) setRemainingMs(null);
    }, SESSION_CONFIG.tickMs);
    return () => window.clearInterval(timer);
  }, [userId, expire]);

  const stay = () => {
    markActive(true);
    setRemainingMs(null);
  };

  return (
    <AlertDialog open={warning}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" aria-hidden />
            Are you still there?
          </AlertDialogTitle>
          <AlertDialogDescription>
            For your security you'll be signed out in{" "}
            <span className="font-semibold tabular-nums text-foreground" aria-live="polite">
              {formatCountdown(remainingMs ?? 0)}
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button variant="outline" onClick={() => void expire()}>
            Log out now
          </Button>
          <Button onClick={stay} autoFocus>
            Stay logged in
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
