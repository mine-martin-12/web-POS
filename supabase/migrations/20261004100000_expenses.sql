-- =====================================================================================
-- Phase 3: expenses (admin-only), for revenue-vs-expenses, Net and Margin reporting
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL DEFAULT public.get_user_business(auth.uid())
                  REFERENCES public.businesses(id) ON DELETE CASCADE,
  category        text NOT NULL,
  description     text,
  amount          numeric(12,2) NOT NULL,
  expense_date    date NOT NULL,
  payment_method  text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mpesa', 'bank_cheque')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_category_not_blank CHECK (length(btrim(category)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON public.expenses (business_id, expense_date DESC);

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER enforce_tenant_scope
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_scope();
CREATE TRIGGER log_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
-- Expenses are financial data: admins only, for every operation.
CREATE POLICY "Admins manage expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()))
  WITH CHECK (business_id = (SELECT public.get_user_business(auth.uid())) AND (SELECT public.is_admin()));

REVOKE ALL ON public.expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
