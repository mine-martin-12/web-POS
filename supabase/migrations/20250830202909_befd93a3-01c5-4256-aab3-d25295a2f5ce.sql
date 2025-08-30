-- Create enum for credit status
CREATE TYPE credit_status AS ENUM ('unpaid', 'partially_paid', 'paid');

-- Create credits table for debtors management
CREATE TABLE public.credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  amount_owed NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status credit_status NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE
);

-- Enable RLS on credits table
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for credits table
CREATE POLICY "Users can view credits in their business" 
ON public.credits 
FOR SELECT 
USING (business_id = get_current_user_business_id());

CREATE POLICY "Users can insert credits for their business" 
ON public.credits 
FOR INSERT 
WITH CHECK (business_id = get_current_user_business_id());

CREATE POLICY "Users can update credits in their business" 
ON public.credits 
FOR UPDATE 
USING (business_id = get_current_user_business_id());

CREATE POLICY "Admins can delete credits in their business" 
ON public.credits 
FOR DELETE 
USING (get_current_user_role() = 'admin'::app_role AND business_id = get_current_user_business_id());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_credits_updated_at
BEFORE UPDATE ON public.credits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update credit status based on payments
CREATE OR REPLACE FUNCTION public.update_credit_status()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update credit status
CREATE TRIGGER update_credit_status_trigger
BEFORE UPDATE ON public.credits
FOR EACH ROW
EXECUTE FUNCTION public.update_credit_status();

-- Add index for performance
CREATE INDEX idx_credits_business_id ON public.credits(business_id);
CREATE INDEX idx_credits_sale_id ON public.credits(sale_id);
CREATE INDEX idx_credits_status ON public.credits(status);