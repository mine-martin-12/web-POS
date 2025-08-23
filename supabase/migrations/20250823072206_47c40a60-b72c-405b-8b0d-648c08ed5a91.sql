-- Create trigger to update product stock when sales are made
CREATE OR REPLACE FUNCTION public.update_product_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Decrease stock when inserting a sale
  IF TG_OP = 'INSERT' THEN
    UPDATE products 
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id;
    
    -- Check if stock went negative
    IF (SELECT stock_quantity FROM products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock. Sale quantity exceeds available stock.';
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle updates (restore old stock and subtract new stock)
  IF TG_OP = 'UPDATE' THEN
    -- First restore the old quantity
    UPDATE products 
    SET stock_quantity = stock_quantity + OLD.quantity
    WHERE id = OLD.product_id;
    
    -- Then subtract the new quantity
    UPDATE products 
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id;
    
    -- Check if stock went negative
    IF (SELECT stock_quantity FROM products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock. Sale quantity exceeds available stock.';
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle deletes (restore stock)
  IF TG_OP = 'DELETE' THEN
    UPDATE products 
    SET stock_quantity = stock_quantity + OLD.quantity
    WHERE id = OLD.product_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- Create the trigger
CREATE TRIGGER update_product_stock_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock_on_sale();