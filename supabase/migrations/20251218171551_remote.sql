-- Add payment_status column to sale_transactions
ALTER TABLE public.sale_transactions 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';

-- Add customer_name column to sale_transactions for easy display
ALTER TABLE public.sale_transactions 
ADD COLUMN IF NOT EXISTS customer_name text;

-- Create function to update sale transaction payment status when credit is updated
CREATE OR REPLACE FUNCTION public.update_sale_transaction_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the linked sale_transaction's payment_status
  IF NEW.transaction_id IS NOT NULL THEN
    UPDATE public.sale_transactions
    SET payment_status = CASE
      WHEN NEW.amount_paid >= NEW.amount_owed THEN 'paid'
      WHEN NEW.amount_paid > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END,
    updated_at = now()
    WHERE id = NEW.transaction_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update sale_transaction payment status
DROP TRIGGER IF EXISTS update_sale_transaction_status_trigger ON public.credits;
CREATE TRIGGER update_sale_transaction_status_trigger
  AFTER UPDATE OF amount_paid ON public.credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sale_transaction_payment_status();;