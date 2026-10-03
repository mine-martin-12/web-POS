import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSecurity } from "@/hooks/useSecurity";
import { QUICK_ACTIONS, type QuickAction } from "@/config/routes";

/** Pages where a floating "create" button would get in the way. */
const HIDDEN_ON = ["/app/settings", "/app/reports", "/app/activity"];

/** Which quick action the button triggers on each page; anything else records a sale. */
const ACTION_FOR_PAGE: Record<string, QuickAction["id"]> = {
  "/app/products": "new-product",
  "/app/customers": "new-customer",
  "/app/staff": "invite-member",
};

/** Floating action button, mobile only. Its action follows the current page. */
export function MobileFab() {
  const isMobile = useIsMobile();
  const { pathname, search } = useLocation();
  const security = useSecurity();

  if (!isMobile) return null;
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;
  // Hidden while a create/edit form is open (quick-action params are present).
  if (/[?&](new|invite|edit)=/.test(search)) return null;

  const wanted = ACTION_FOR_PAGE[pathname] ?? "new-sale";
  const action =
    QUICK_ACTIONS.find((a) => a.id === wanted && (!a.capability || security[a.capability])) ??
    QUICK_ACTIONS.find((a) => a.id === "new-sale")!;

  return (
    <Link
      to={action.to}
      aria-label={action.label}
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-white shadow-glow transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-scale-in"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Plus className="h-6 w-6" aria-hidden />
    </Link>
  );
}
