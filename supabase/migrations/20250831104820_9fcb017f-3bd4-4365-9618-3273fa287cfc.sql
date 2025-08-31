-- Fix security warning by setting search_path for update_credit_status function
CREATE OR REPLACE FUNCTION public.update_credit_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.amount_paid >= NEW.amount_owed THEN
    NEW.status = 'paid';
  ELSIF NEW.amount_paid > 0 THEN
    NEW.status = 'partially_paid';
  ELSE
    NEW.status = 'unpaid';
  END IF;
  
  RETURN NEW;
END;
$function$