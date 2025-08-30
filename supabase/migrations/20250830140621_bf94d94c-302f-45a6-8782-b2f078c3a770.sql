-- Update the sales table payment_method check constraint to include bank/cheque
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check CHECK (payment_method IN ('cash', 'mpesa', 'bank_cheque'));