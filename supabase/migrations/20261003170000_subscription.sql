-- =====================================================================================
-- Phase 2: trial / subscription gating
--
-- businesses.account_status + trial_ends_at. Expiry is enforced in the DATABASE:
-- get_user_business() — used by every data policy, the tenant trigger and every RPC —
-- returns NULL once a business is expired or suspended, so its members can read and
-- write nothing but their own profile, role and business row (needed for the
-- "expired" page). Only the service role (platform owner) can change the status.
-- =====================================================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'trial'
    CHECK (account_status IN ('trial', 'active', 'expired', 'suspended')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '14 days');

-- Businesses that existed before gating keep working.
UPDATE public.businesses SET account_status = 'active', trial_ends_at = NULL
WHERE created_at < now() - interval '1 minute' OR account_status = 'trial' AND trial_ends_at IS NULL;

CREATE OR REPLACE FUNCTION public.business_is_active(_business uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = _business
      AND (account_status = 'active' OR (account_status = 'trial' AND trial_ends_at > now()))
  );
$$;

-- Membership regardless of subscription state (profile, role and business row only).
CREATE OR REPLACE FUNCTION public.get_member_business(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE user_id = _user_id AND is_active;
$$;

-- The business an ACTIVE member may work in: NULL when deactivated, expired or suspended.
CREATE OR REPLACE FUNCTION public.get_user_business(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.business_id
  FROM public.profiles p
  JOIN public.businesses b ON b.id = p.business_id
  WHERE p.user_id = _user_id
    AND p.is_active
    AND (b.account_status = 'active' OR (b.account_status = 'trial' AND b.trial_ends_at > now()));
$$;

-- An expired business must still be able to see who it is (for the expired page).
DROP POLICY IF EXISTS "Members can view their business" ON public.businesses;
CREATE POLICY "Members can view their business" ON public.businesses
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_member_business(auth.uid())));

-- Clients still have no write access to businesses at all (since Phase 1), so nobody —
-- including admins — can change account_status or trial_ends_at; update_business_details()
-- doesn't touch them either.

REVOKE EXECUTE ON FUNCTION public.business_is_active(uuid), public.get_member_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_is_active(uuid), public.get_member_business(uuid) TO authenticated;
