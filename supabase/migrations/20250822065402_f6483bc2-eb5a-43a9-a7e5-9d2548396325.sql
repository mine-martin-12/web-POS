-- Fix the search path for the calculate_total_buying_price function
CREATE OR REPLACE FUNCTION public.calculate_total_buying_price()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.total_buying_price = NEW.buying_price * NEW.stock_quantity;
  RETURN NEW;
END;
$$;