-- Drop the current policy with performance issue
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Recreate the policy with optimized expression for better performance
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = (SELECT auth.uid()));