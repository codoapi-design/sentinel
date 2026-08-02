-- Local/dev fix: auth.users trigger must resolve public.user_profiles under a fixed search_path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, full_name, plan, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'starter',
    'active'
  );
  RETURN NEW;
END;
$function$;
