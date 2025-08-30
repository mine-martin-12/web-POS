-- Create function to automatically create profile when user signs up
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
    COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'user'),
    COALESCE((NEW.raw_user_meta_data ->> 'business_id')::UUID, gen_random_uuid()),
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', 'My Business')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();