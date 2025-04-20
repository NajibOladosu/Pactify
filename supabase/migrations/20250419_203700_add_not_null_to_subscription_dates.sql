-- Add NOT NULL constraints to user_subscriptions date columns

-- Ensure current_period_start is NOT NULL
ALTER TABLE public.user_subscriptions
ALTER COLUMN current_period_start SET NOT NULL;

-- Ensure current_period_end is NOT NULL
ALTER TABLE public.user_subscriptions
ALTER COLUMN current_period_end SET NOT NULL;

-- Note: This migration might fail if there are existing rows
-- with NULL values in these columns. Those rows must be fixed
-- (either deleted or updated with valid dates) before applying
-- this migration. Consider running a backfill script first.
