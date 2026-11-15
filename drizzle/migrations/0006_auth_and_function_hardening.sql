-- Auth profile bootstrap and function hardening. Applied to the production Supabase project.
-- Do not trust user_metadata for authorization; it is used here only for display fields.

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
  profile_name := left(nullif(trim(coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    ''
  )), ''), 160);

  INSERT INTO public.profiles (id, username, display_name, team_id)
  VALUES (NEW.id, username_base, profile_name, NEW.id);

  -- Every new account starts with the regular owner role; provider metadata never grants roles.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usta');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = _role
    )
    ELSE false
  END;
$$;

ALTER FUNCTION public.current_team() SET search_path = '';
ALTER FUNCTION public.is_team_usta() SET search_path = '';
ALTER FUNCTION public.try_uuid(text) SET search_path = '';
ALTER FUNCTION public.bill_job(uuid) SET search_path = '';
ALTER FUNCTION public.service_equipment(uuid, text, numeric) SET search_path = '';
ALTER FUNCTION public.bump_machine_seconds(uuid, uuid, numeric) SET search_path = '';
ALTER FUNCTION public.sync_job_machine_hours() SET search_path = '';
ALTER FUNCTION public.sync_job_machine_hours_after_insert() SET search_path = '';

-- Trigger-only helpers must not be callable through PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_job_machine_hours() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_job_machine_hours_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_uuid(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_machine_seconds(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- Helpers used by RLS and protected operations remain available only to signed-in users.
REVOKE EXECUTE ON FUNCTION public.current_team() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_usta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_usta() TO authenticated;

-- These two signed-in RPCs perform intentional writes, with team and role checks in their bodies.
REVOKE EXECUTE ON FUNCTION public.bill_job(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.service_equipment(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_equipment(uuid, text, numeric) TO authenticated;
