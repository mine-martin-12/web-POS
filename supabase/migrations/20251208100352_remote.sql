-- Create sale_transactions table
CREATE TABLE public.sale_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  created_by UUID,
  receipt_number TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sale_items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.sale_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  buying_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add transaction_id to credits table for new transactions
ALTER TABLE public.credits ADD COLUMN transaction_id UUID REFERENCES public.sale_transactions(id);

-- Enable RLS
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for sale_transactions
CREATE POLICY "Users can view transactions in their business"
ON public.sale_transactions FOR SELECT
USING (business_id = get_current_user_business_id());

CREATE POLICY "Users can insert transactions for their business"
ON public.sale_transactions FOR INSERT
WITH CHECK (business_id = get_current_user_business_id());

CREATE POLICY "Users can update transactions in their business"
ON public.sale_transactions FOR UPDATE
USING (business_id = get_current_user_business_id());

CREATE POLICY "Admins can delete transactions in their business"
ON public.sale_transactions FOR DELETE
USING (get_current_user_role() = 'admin' AND business_id = get_current_user_business_id());

-- RLS policies for sale_items (access through transaction)
CREATE POLICY "Users can view sale items in their business"
ON public.sale_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.sale_transactions st
  WHERE st.id = sale_items.transaction_id
  AND st.business_id = get_current_user_business_id()
));

CREATE POLICY "Users can insert sale items for their business"
ON public.sale_items FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sale_transactions st
  WHERE st.id = sale_items.transaction_id
  AND st.business_id = get_current_user_business_id()
));

CREATE POLICY "Users can update sale items in their business"
ON public.sale_items FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.sale_transactions st
  WHERE st.id = sale_items.transaction_id
  AND st.business_id = get_current_user_business_id()
));

CREATE POLICY "Admins can delete sale items in their business"
ON public.sale_items FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.sale_transactions st
  WHERE st.id = sale_items.transaction_id
  AND st.business_id = get_current_user_business_id()
  AND get_current_user_role() = 'admin'
));

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date TEXT;
  sequence_num INTEGER;
BEGIN
  today_date := to_char(NOW() AT TIME ZONE 'Africa/Nairobi', 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(receipt_number FROM 'RCP-' || today_date || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM public.sale_transactions
  WHERE receipt_number LIKE 'RCP-' || today_date || '-%'
  AND business_id = NEW.business_id;
  
  NEW.receipt_number := 'RCP-' || today_date || '-' || LPAD(sequence_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

-- Trigger for receipt number generation
CREATE TRIGGER generate_receipt_number_trigger
BEFORE INSERT ON public.sale_transactions
FOR EACH ROW
WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
EXECUTE FUNCTION public.generate_receipt_number();

-- Function to calculate sale item total
CREATE OR REPLACE FUNCTION public.calculate_sale_item_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.total_price := NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$;

-- Trigger for sale item total calculation
CREATE TRIGGER calculate_sale_item_total_trigger
BEFORE INSERT OR UPDATE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.calculate_sale_item_total();

-- Function to update transaction totals when items change
CREATE OR REPLACE FUNCTION public.update_transaction_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trans_id UUID;
  new_subtotal NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    trans_id := OLD.transaction_id;
  ELSE
    trans_id := NEW.transaction_id;
  END IF;
  
  SELECT COALESCE(SUM(total_price), 0)
  INTO new_subtotal
  FROM public.sale_items
  WHERE transaction_id = trans_id;
  
  UPDATE public.sale_transactions
  SET subtotal = new_subtotal,
      total_amount = new_subtotal,
      updated_at = now()
  WHERE id = trans_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to update transaction totals
CREATE TRIGGER update_transaction_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.update_transaction_totals();

-- Function to update product stock when sale items are added
CREATE OR REPLACE FUNCTION public.update_stock_on_sale_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id;
    
    IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity + OLD.quantity - NEW.quantity
    WHERE id = NEW.product_id;
    
    IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity + OLD.quantity
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger for stock updates
CREATE TRIGGER update_stock_on_sale_item_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.update_stock_on_sale_item();

-- Add updated_at trigger for sale_transactions
CREATE TRIGGER update_sale_transactions_updated_at
BEFORE UPDATE ON public.sale_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();;