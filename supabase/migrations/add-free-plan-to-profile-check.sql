-- Allow Free Plan on user_profiles (3-day trial + marketing Free tier).
-- Live DB previously only allowed starter / pro / enterprise.

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_plan_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_plan_check
  CHECK (plan = ANY (ARRAY[
    'free'::text,
    'starter'::text,
    'pro'::text,
    'business'::text,
    'enterprise'::text
  ]));
