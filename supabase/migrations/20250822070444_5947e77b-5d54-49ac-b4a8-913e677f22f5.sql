-- Create trigger to automatically calculate total_price for sales
CREATE OR REPLACE FUNCTION public.calculate_sale_total_price()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.total_price = NEW.quantity * NEW.selling_price;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_sale_total_price ON public.sales;

-- Create trigger for automatic total_price calculation
CREATE TRIGGER update_sale_total_price
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_sale_total_price();