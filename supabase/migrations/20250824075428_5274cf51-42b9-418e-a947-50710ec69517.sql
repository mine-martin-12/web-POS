-- Add payment_method column to sales table
ALTER TABLE public.sales 
ADD COLUMN payment_method text NOT NULL DEFAULT 'cash' 
CHECK (payment_method IN ('cash', 'mpesa'));