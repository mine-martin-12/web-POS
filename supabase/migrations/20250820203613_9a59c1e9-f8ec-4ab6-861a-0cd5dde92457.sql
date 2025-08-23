-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  business_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  size TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  buying_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_buying_price NUMERIC(12,2) GENERATED ALWAYS AS (buying_price * stock_quantity) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales table
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  selling_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * selling_price) STORED,
  sale_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_profiles_business_id ON public.profiles(business_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_products_business_id ON public.products(business_id);
CREATE INDEX idx_sales_business_id ON public.sales(business_id);
CREATE INDEX idx_sales_product_id ON public.sales(product_id);
CREATE INDEX idx_sales_sale_date ON public.sales(sale_date);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get current user's business_id and role
CREATE OR REPLACE FUNCTION public.get_current_user_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- RLS Policies for profiles table
CREATE POLICY "Users can view profiles in their business" 
ON public.profiles FOR SELECT 
USING (business_id = public.get_current_user_business_id());

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Admins can insert profiles for their business" 
ON public.profiles FOR INSERT 
WITH CHECK (public.get_current_user_role() = 'admin' AND business_id = public.get_current_user_business_id());

CREATE POLICY "Admins can delete profiles in their business" 
ON public.profiles FOR DELETE 
USING (public.get_current_user_role() = 'admin' AND business_id = public.get_current_user_business_id());

-- RLS Policies for products table
CREATE POLICY "Users can view products in their business" 
ON public.products FOR SELECT 
USING (business_id = public.get_current_user_business_id());

CREATE POLICY "Users can insert products for their business" 
ON public.products FOR INSERT 
WITH CHECK (business_id = public.get_current_user_business_id());

CREATE POLICY "Users can update products in their business" 
ON public.products FOR UPDATE 
USING (business_id = public.get_current_user_business_id());

CREATE POLICY "Admins can delete products in their business" 
ON public.products FOR DELETE 
USING (public.get_current_user_role() = 'admin' AND business_id = public.get_current_user_business_id());

-- RLS Policies for sales table
CREATE POLICY "Users can view sales in their business" 
ON public.sales FOR SELECT 
USING (business_id = public.get_current_user_business_id());

CREATE POLICY "Users can insert sales for their business" 
ON public.sales FOR INSERT 
WITH CHECK (business_id = public.get_current_user_business_id());

CREATE POLICY "Users can update sales in their business" 
ON public.sales FOR UPDATE 
USING (business_id = public.get_current_user_business_id());

CREATE POLICY "Admins can delete sales in their business" 
ON public.sales FOR DELETE 
USING (public.get_current_user_role() = 'admin' AND business_id = public.get_current_user_business_id());

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    role,
    business_id,
    business_name
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'admin'),
    COALESCE((NEW.raw_user_meta_data ->> 'business_id')::UUID, gen_random_uuid()),
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', 'My Business')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();