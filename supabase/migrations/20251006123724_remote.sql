-- =====================================================
-- CRITICAL SECURITY ENHANCEMENT: User Roles System
-- =====================================================

-- Create enum for roles (if not exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'manager');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table for secure role management
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  business_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, business_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles in their business"
ON public.user_roles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin' 
    AND ur.business_id = user_roles.business_id
  )
);

-- Security definer function to check roles (PREVENTS INFINITE RECURSION)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role (returns first role found)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Migrate existing roles from profiles to user_roles
INSERT INTO public.user_roles (user_id, role, business_id)
SELECT user_id, role, business_id 
FROM public.profiles
ON CONFLICT (user_id, business_id) DO NOTHING;

-- =====================================================
-- PRODUCTS TABLE ENHANCEMENTS (Low Stock Alerts)
-- =====================================================

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER;

-- =====================================================
-- SALES TABLE ENHANCEMENTS (Staff Performance Tracking)
-- =====================================================

ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Update existing sales to set created_by from business context
UPDATE public.sales
SET created_by = (
  SELECT user_id FROM public.profiles 
  WHERE business_id = sales.business_id 
  AND role = 'admin' 
  LIMIT 1
)
WHERE created_by IS NULL;

-- =====================================================
-- CUSTOMERS TABLE (Credit Management Enhancement)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC DEFAULT 0,
  total_credit_used NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers in their business"
ON public.customers FOR SELECT
USING (business_id = get_current_user_business_id());

CREATE POLICY "Users can insert customers for their business"
ON public.customers FOR INSERT
WITH CHECK (business_id = get_current_user_business_id());

CREATE POLICY "Users can update customers in their business"
ON public.customers FOR UPDATE
USING (business_id = get_current_user_business_id());

CREATE POLICY "Admins can delete customers in their business"
ON public.customers FOR DELETE
USING (has_role(auth.uid(), 'admin') AND business_id = get_current_user_business_id());

-- =====================================================
-- CREDIT PAYMENTS TABLE (Payment History Tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id UUID REFERENCES public.credits(id) ON DELETE CASCADE NOT NULL,
  business_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT now(),
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credit payments in their business"
ON public.credit_payments FOR SELECT
USING (business_id = get_current_user_business_id());

CREATE POLICY "Users can insert credit payments for their business"
ON public.credit_payments FOR INSERT
WITH CHECK (business_id = get_current_user_business_id());

CREATE POLICY "Admins can delete credit payments in their business"
ON public.credit_payments FOR DELETE
USING (has_role(auth.uid(), 'admin') AND business_id = get_current_user_business_id());

-- Trigger to update credit amount_paid when payment is added
CREATE OR REPLACE FUNCTION public.update_credit_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.credits
    SET amount_paid = amount_paid + NEW.amount,
        updated_at = now()
    WHERE id = NEW.credit_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.credits
    SET amount_paid = amount_paid - OLD.amount,
        updated_at = now()
    WHERE id = OLD.credit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_credit_on_payment_trigger
AFTER INSERT OR DELETE ON public.credit_payments
FOR EACH ROW EXECUTE FUNCTION public.update_credit_on_payment();

-- =====================================================
-- EXPENSES TABLE (Expense Tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  receipt_url TEXT,
  expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Users can view their own expenses
CREATE POLICY "Users can view own expenses"
ON public.expenses FOR SELECT
USING (user_id = auth.uid() OR business_id = get_current_user_business_id());

-- Admins can view all expenses in their business
CREATE POLICY "Admins can view all business expenses"
ON public.expenses FOR SELECT
USING (has_role(auth.uid(), 'admin') AND business_id = get_current_user_business_id());

-- Users can insert their own expenses
CREATE POLICY "Users can insert own expenses"
ON public.expenses FOR INSERT
WITH CHECK (business_id = get_current_user_business_id() AND user_id = auth.uid());

-- Users can update their own pending expenses
CREATE POLICY "Users can update own pending expenses"
ON public.expenses FOR UPDATE
USING (user_id = auth.uid() AND status = 'pending');

-- Admins can update/approve all expenses
CREATE POLICY "Admins can update all expenses"
ON public.expenses FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND business_id = get_current_user_business_id());

-- Admins can delete expenses
CREATE POLICY "Admins can delete expenses"
ON public.expenses FOR DELETE
USING (has_role(auth.uid(), 'admin') AND business_id = get_current_user_business_id());

-- Trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- CREDITS TABLE ENHANCEMENTS
-- =====================================================

-- Add customer reference to credits
ALTER TABLE public.credits
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Migrate existing customer names to customers table
INSERT INTO public.customers (business_id, name)
SELECT DISTINCT c.business_id, c.customer_name
FROM public.credits c
WHERE c.customer_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customers cust
    WHERE cust.name = c.customer_name
    AND cust.business_id = c.business_id
  )
ON CONFLICT DO NOTHING;

-- Link existing credits to customers
UPDATE public.credits c
SET customer_id = (
  SELECT id FROM public.customers cust
  WHERE cust.name = c.customer_name
  AND cust.business_id = c.business_id
  LIMIT 1
)
WHERE customer_id IS NULL AND customer_name IS NOT NULL;;