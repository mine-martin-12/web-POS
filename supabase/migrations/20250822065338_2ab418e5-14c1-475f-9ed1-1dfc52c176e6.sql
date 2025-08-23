-- First, drop the generated column and recreate it as a regular computed column
ALTER TABLE public.products 
ALTER COLUMN total_buying_price DROP EXPRESSION;

-- Add a trigger to automatically calculate total_buying_price
CREATE OR REPLACE FUNCTION public.calculate_total_buying_price()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_buying_price = NEW.buying_price * NEW.stock_quantity;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_total_buying_price_trigger
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_total_buying_price();