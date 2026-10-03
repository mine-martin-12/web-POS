/** Mirrors business_is_active() in the database (the real enforcement). */
export const TRIAL_WARNING_DAYS = 2;

export type AccountStatus = "trial" | "active" | "expired" | "suspended";

export interface SubscriptionState {
  status: AccountStatus;
  active: boolean;
  /** Whole days left in the trial (rounded up); null when not on a trial. */
  daysLeft: number | null;
  trialEndsAt: Date | null;
}

export function subscriptionState(
  business: { account_status: string; trial_ends_at: string | null } | null | undefined,
  now = new Date(),
): SubscriptionState {
  const status = (business?.account_status ?? "active") as AccountStatus;
  const trialEndsAt = business?.trial_ends_at ? new Date(business.trial_ends_at) : null;
  if (status === "trial") {
    const msLeft = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0;
    return {
      status,
      active: msLeft > 0,
      daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
      trialEndsAt,
    };
  }
  return { status, active: status === "active", daysLeft: null, trialEndsAt };
}

/** Where people go for help with their account (set VITE_SUPPORT_EMAIL / VITE_SUPPORT_PHONE). */
export const SUPPORT_CONTACT = {
  email: import.meta.env.VITE_SUPPORT_EMAIL as string | undefined,
  phone: import.meta.env.VITE_SUPPORT_PHONE as string | undefined,
};
