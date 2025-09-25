# Manual Fix for Onboarding Issue

## Problem
The database schema is missing columns that the onboarding API expects:
- `onboarding_completed` 
- `onboarding_completed_at`
- `phone`
- `email` 
- `skills`
- `business_name` (mapped to existing `company_name`)

## Quick Solution

Run this SQL in your Supabase dashboard to add the missing columns:

```sql
-- Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- Update existing profiles to have onboarding_completed = false
UPDATE public.profiles 
SET onboarding_completed = FALSE 
WHERE onboarding_completed IS NULL;

-- Mark your specific user as completed (replace USER_ID with your actual user ID)
UPDATE public.profiles 
SET 
  onboarding_completed = TRUE,
  onboarding_completed_at = NOW(),
  email = 'najiboladosu@gmail.com'
WHERE id = 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73';
```

## Alternative: Skip Onboarding

If you want to skip onboarding for now, just run this single update:

```sql
UPDATE public.profiles 
SET onboarding_completed = TRUE
WHERE id = 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73';
```

Then refresh your browser and you should be able to access the dashboard.

## Steps:
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL commands above
4. Refresh your browser
5. You should now be able to access `/dashboard` without the onboarding redirect