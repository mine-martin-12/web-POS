-- Fix customer PII security issue
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view customers in their business" ON customers;
DROP POLICY IF EXISTS "Users can insert customers for their business" ON customers;
DROP POLICY IF EXISTS "Users can update customers in their business" ON customers;
DROP POLICY IF EXISTS "Admins can delete customers in their business" ON customers;

-- Policy 1: All users can view basic customer info
-- Note: Postgres RLS doesn't support column-level restrictions directly,
-- Applications must check roles before showing email/phone to non-admins
CREATE POLICY "Users can view customers in their business"
ON customers FOR SELECT
USING (business_id = get_current_user_business_id());

-- Policy 2: Users can insert customers (but only admins can set email/phone)
CREATE POLICY "Users can insert customers for their business"
ON customers FOR INSERT
WITH CHECK (
  business_id = get_current_user_business_id()
  AND (
    -- Admins can set any fields
    has_role(auth.uid(), 'admin'::app_role)
    -- Non-admins can only create customers without PII
    OR (email IS NULL AND phone IS NULL)
  )
);

-- Policy 3: Users can update customers (admins only for email/phone changes)
CREATE POLICY "Users can update customers in their business"
ON customers FOR UPDATE
USING (business_id = get_current_user_business_id())
WITH CHECK (
  business_id = get_current_user_business_id()
  AND (
    -- Admins can update any fields
    has_role(auth.uid(), 'admin'::app_role)
    -- Non-admins can only update if email/phone are not being added
    OR (email IS NULL AND phone IS NULL)
  )
);

-- Policy 4: Only admins can delete customers
CREATE POLICY "Admins can delete customers in their business"
ON customers FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND business_id = get_current_user_business_id()
);

-- Add a helper function to check if user can view customer PII
CREATE OR REPLACE FUNCTION public.can_view_customer_pii(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(_user_id, 'admin'::app_role)
$$;;