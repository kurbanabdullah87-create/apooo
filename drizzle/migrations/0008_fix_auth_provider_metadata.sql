-- auth.users stores provider metadata in raw_app_meta_data.
-- app_metadata is a JWT claim name, not a column on the trigger's NEW record.
-- Reading the nonexistent field aborts every new email or OAuth user insert.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  username_base text;
  profile_name text;
BEGIN
  username_base := lower(regexp_replace(
    coalesce(nullif(NEW.raw_user_meta_data->>'username', ''), split_part(coalesce(NEW.email, ''), '@', 1)),
    '[^a-zA-Z0-9._-]', '', 'g'
  ));
  username_base := left(coalesce(nullif(username_base, ''), 'user'), 13) || '-' || left(NEW.id::text, 10);

  IF NEW.raw_app_meta_data->>'provider' = 'email' THEN
    profile_name := left(nullif(trim(coalesce(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'display_name',
      ''
    )), ''), 160);
  ELSE
    -- OAuth users confirm their own name in the app after authentication.
    profile_name := NULL;
  END IF;

  INSERT INTO public.profiles (id, username, display_name, team_id)
  VALUES (NEW.id, username_base, profile_name, NEW.id);

  -- Provider-controlled metadata never grants application roles.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usta');

  RETURN NEW;
END;
$$;
