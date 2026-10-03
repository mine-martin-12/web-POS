-- =====================================================================================
-- Explicit client privileges on profiles, products, sales and credits
--
-- The Phase 1 migration revoked what clients may NOT do on these four tables but never
-- granted what they MAY do: it relied on Supabase's default "GRANT ALL ... TO
-- authenticated". Databases without those defaults (as in production) then refuse every
-- read with "permission denied for table profiles", even though the RLS SELECT policies
-- exist. Every newer table already grants its privileges explicitly; this brings these
-- four in line.
--
-- These are exactly the privileges the migrations intended (the state the database tests
-- run against). RLS still decides which rows: members see their own business only, staff
-- see only the sales they recorded, and updates and deletes are admin-only.
-- =====================================================================================

-- Start from nothing so the result doesn't depend on what the project had before.
-- TRUNCATE ignores RLS, so clients must never hold it.
REVOKE ALL ON public.profiles, public.products, public.sales, public.credits FROM anon, authenticated;

-- profiles: read members of your business; change only your own name.
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (first_name, last_name) ON public.profiles TO authenticated;

-- products: members add products; RLS limits update/delete to admins.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- sales: written only through record_sale() / update_sale(); admins may delete.
GRANT SELECT, DELETE ON public.sales TO authenticated;

-- credits: written only through record_sale() / record_credit_payment() / approvals.
GRANT SELECT ON public.credits TO authenticated;
