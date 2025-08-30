-- Normalize existing emails (trim + lowercase)
UPDATE public.profiles
SET email = lower(trim(email))
WHERE email IS NOT NULL;

-- Create a case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_email_ci
ON public.profiles (lower(email));