-- Add missing columns to profiles table for onboarding functionality

-- Add onboarding completion tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

-- Add user contact information
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add skills as JSONB array
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- Add business_name as alias for company_name (we'll map this in the API)
-- ALTER TABLE public.profiles 
-- ADD COLUMN IF NOT EXISTS business_name TEXT;

-- Or we could add a computed column/view, but for now we'll handle this in the API

-- Update existing profiles to have onboarding_completed = false if null
UPDATE public.profiles 
SET onboarding_completed = FALSE 
WHERE onboarding_completed IS NULL;

-- Create an index on onboarding_completed for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON public.profiles(onboarding_completed);

-- Add RLS policies for the new columns (inherit from existing profile policies)