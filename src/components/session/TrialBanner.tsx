import React from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORT_CONTACT, subscriptionState, TRIAL_WARNING_DAYS } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/** "N days left in your free trial"; turns red in the last TRIAL_WARNING_DAYS days. */
export function TrialBanner() {
  const { business } = useAuth();
  const state = subscriptionState(business);
  if (state.status !== "trial" || !state.active || state.daysLeft === null) return null;
  const urgent = state.daysLeft <= TRIAL_WARNING_DAYS;
  const contact = SUPPORT_CONTACT.email ? `mailto:${SUPPORT_CONTACT.email}` : SUPPORT_CONTACT.phone ? `tel:${SUPPORT_CONTACT.phone}` : null;

  return (
    <div
      role="status"
      className={cn(
        "mx-2 mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-center text-sm",
        urgent ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/5 text-foreground",
      )}
    >
      <Clock className="h-4 w-4" aria-hidden />
      <span>
        <strong>
          {state.daysLeft} {state.daysLeft === 1 ? "day" : "days"} left
        </strong>{" "}
        in your free trial{state.trialEndsAt ? ` (ends ${format(state.trialEndsAt, "d MMM")})` : ""}.
      </span>
      {contact && (
        <a href={contact} className="font-medium underline underline-offset-2">
          Contact us to continue
        </a>
      )}
    </div>
  );
}
