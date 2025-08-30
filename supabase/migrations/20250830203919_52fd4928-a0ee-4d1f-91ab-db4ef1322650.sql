-- Remove the old constraint that doesn't include 'credit'
ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;

-- Add the new constraint with 'credit' included
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method = ANY (ARRAY['cash'::text, 'mpesa'::text, 'bank_cheque'::text, 'credit'::text]));