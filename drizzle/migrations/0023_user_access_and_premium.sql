-- Account-level access, administrator allowlist and paid annual entitlements.
-- No browser-supplied metadata can grant a role or paid access.

CREATE TABLE IF NOT EXISTS public.authorized_emails (
  email text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_emails FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.authorized_emails FROM anon, authenticated;
GRANT ALL ON public.authorized_emails TO service_role;

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'premium_annual' CHECK (plan_code = 'premium_annual'),
  status text NOT NULL CHECK (status IN ('active','expired','cancelled','refunded')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  provider text NOT NULL,
  provider_reference text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_entitlements FROM anon, authenticated;
GRANT ALL ON public.plan_entitlements TO service_role;

INSERT INTO public.authorized_emails(email, enabled, is_admin)
VALUES ('abdullahkurban670@gmail.com', true, true)
ON CONFLICT (email) DO UPDATE SET enabled = true, is_admin = true, updated_at = now();

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.authorized_emails a ON a.email = lower(u.email)
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL AND a.enabled AND a.is_admin
  );
$$;

CREATE OR REPLACE FUNCTION public.has_full_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM auth.users u JOIN public.authorized_emails a ON a.email=lower(u.email) WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND a.enabled) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.plan_entitlements e
      WHERE e.user_id = auth.uid() AND e.status = 'active'
        AND e.starts_at <= now() AND e.expires_at > now()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_access()
RETURNS TABLE(is_admin boolean, is_premium boolean, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_app_admin(), public.has_full_access(),
    (SELECT e.expires_at FROM public.plan_entitlements e
      WHERE e.user_id = auth.uid() AND e.status = 'active'
        AND e.starts_at <= now() AND e.expires_at > now()
      ORDER BY e.expires_at DESC LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.list_authorized_emails()
RETURNS TABLE(email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY SELECT a.email, a.created_at FROM public.authorized_emails a
    WHERE a.enabled ORDER BY a.created_at, a.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_authorized_email(_email text, _enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized_email text := lower(btrim(coalesce(_email, ''))); confirmed_user uuid; admins integer;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(normalized_email) > 254 THEN
    RAISE EXCEPTION 'Geçerli bir e-posta adresi girin.';
  END IF;
  IF _enabled THEN
    SELECT id INTO confirmed_user FROM auth.users
      WHERE lower(email) = normalized_email AND email_confirmed_at IS NOT NULL LIMIT 1;
    IF confirmed_user IS NULL THEN RAISE EXCEPTION 'Önce bu e-posta ile kayıtlı, doğrulanmış bir hesap olmalı.'; END IF;
    INSERT INTO public.authorized_emails(email, enabled, is_admin, created_by, updated_at)
      VALUES (normalized_email, true, false, auth.uid(), now())
      ON CONFLICT (email) DO UPDATE SET enabled = true, updated_at = now();
    SELECT id INTO confirmed_user FROM auth.users WHERE lower(email) = normalized_email AND email_confirmed_at IS NOT NULL LIMIT 1;
    DELETE FROM public.user_roles WHERE user_id = confirmed_user AND role = 'cirak';
    INSERT INTO public.user_roles(user_id, role) VALUES (confirmed_user, 'usta') ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    IF normalized_email = lower((SELECT email FROM auth.users WHERE id = auth.uid())) THEN
      RAISE EXCEPTION 'Kendi yönetici erişiminizi bu ekrandan kaldıramazsınız.';
    END IF;
    SELECT count(*) INTO admins FROM public.authorized_emails WHERE enabled;
    IF admins <= 1 THEN RAISE EXCEPTION 'Son yönetici hesabı kaldırılamaz.'; END IF;
    UPDATE public.authorized_emails SET enabled = false, updated_at = now() WHERE email = normalized_email;
    SELECT id INTO confirmed_user FROM auth.users WHERE lower(email) = normalized_email LIMIT 1;
    IF confirmed_user IS NOT NULL THEN
      DELETE FROM public.user_roles WHERE user_id = confirmed_user AND role = 'usta';
      INSERT INTO public.user_roles(user_id, role) VALUES (confirmed_user, 'cirak') ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_full_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_authorized_emails() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_authorized_email(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_full_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_authorized_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_authorized_email(text, boolean) TO authenticated;

-- Existing self-registered accounts are downgraded unless explicitly authorized.
DELETE FROM public.user_roles ur WHERE ur.role = 'usta' AND NOT EXISTS (
  SELECT 1 FROM auth.users u JOIN public.authorized_emails a ON a.email = lower(u.email)
  WHERE u.id = ur.user_id AND u.email_confirmed_at IS NOT NULL AND a.enabled
);
INSERT INTO public.user_roles(user_id, role)
SELECT u.id, 'cirak'::public.app_role FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.authorized_emails a WHERE a.email = lower(u.email) AND a.enabled)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'cirak')
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM public.user_roles ur WHERE ur.role = 'cirak' AND EXISTS (
  SELECT 1 FROM auth.users u JOIN public.authorized_emails a ON a.email = lower(u.email)
  WHERE u.id = ur.user_id AND u.email_confirmed_at IS NOT NULL AND a.enabled
);
INSERT INTO public.user_roles(user_id, role)
SELECT u.id, 'usta'::public.app_role FROM auth.users u
JOIN public.authorized_emails a ON a.email = lower(u.email) AND a.enabled
WHERE u.email_confirmed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'usta')
ON CONFLICT (user_id, role) DO NOTHING;

-- The existing helper is used by premium-only policies and functions.
CREATE OR REPLACE FUNCTION public.is_team_usta()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_full_access()
$$;

CREATE OR REPLACE FUNCTION public.set_default_business_profile(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); team uuid; chosen uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.has_full_access() THEN
    RAISE EXCEPTION 'Bu işlem yalnızca yetkili çalışma alanı sahibi tarafından yapılabilir.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp WHERE bp.team_id=team ORDER BY bp.id FOR UPDATE;
  SELECT bp.id INTO chosen FROM public.business_profiles bp WHERE bp.id=_profile_id AND bp.team_id=team AND NOT bp.is_archived;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Etkin profil bulunamadı.'; END IF;
  UPDATE public.business_profiles SET is_default=false WHERE team_id=team AND is_default AND id<>chosen;
  UPDATE public.business_profiles SET is_default=true WHERE id=chosen AND team_id=team AND NOT is_default;
  RETURN chosen;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_business_profile(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); team uuid; target_default boolean; target_archived boolean; replacement uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.has_full_access() THEN
    RAISE EXCEPTION 'Bu işlem yalnızca yetkili çalışma alanı sahibi tarafından yapılabilir.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp WHERE bp.team_id=team ORDER BY bp.id FOR UPDATE;
  SELECT bp.is_default,bp.is_archived INTO target_default,target_archived FROM public.business_profiles bp WHERE bp.id=_profile_id AND bp.team_id=team;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil bulunamadı.'; END IF;
  IF target_archived THEN
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
    RETURN replacement;
  END IF;
  IF target_default THEN
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.id<>_profile_id AND NOT bp.is_archived ORDER BY bp.created_at,bp.id LIMIT 1;
    IF replacement IS NULL THEN RAISE EXCEPTION 'Son etkin profil kaldırılamaz. Önce yeni bir profil oluşturun.'; END IF;
    UPDATE public.business_profiles SET is_default=false WHERE id=_profile_id AND team_id=team;
    UPDATE public.business_profiles SET is_default=true WHERE id=replacement AND team_id=team;
  ELSE
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
  END IF;
  UPDATE public.business_profiles SET is_archived=true WHERE id=_profile_id AND team_id=team;
  RETURN replacement;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_business_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_business_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_business_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_business_profile(uuid) TO authenticated;

-- Every new account is basic by default; metadata cannot assign access.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE username_base text; profile_name text; initial_role public.app_role;
BEGIN
  username_base := lower(regexp_replace(coalesce(nullif(NEW.raw_user_meta_data->>'username',''), split_part(coalesce(NEW.email,''),'@',1)), '[^a-zA-Z0-9._-]', '', 'g'));
  username_base := left(coalesce(nullif(username_base,''),'user'), 13) || '-' || left(NEW.id::text,10);
  profile_name := left(nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name',NEW.raw_user_meta_data->>'display_name','')),''),160);
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.authorized_emails a WHERE a.email = lower(NEW.email) AND a.enabled) THEN 'usta'::public.app_role ELSE 'cirak'::public.app_role END INTO initial_role;
  INSERT INTO public.profiles(id, username, display_name, team_id) VALUES(NEW.id, username_base, profile_name, NEW.id);
  INSERT INTO public.user_roles(user_id, role) VALUES(NEW.id, initial_role);
  INSERT INTO public.business_profiles(team_id, name, is_default, created_by)
    VALUES(NEW.id, coalesce(nullif(btrim(profile_name),''), split_part(coalesce(NEW.email,''),'@',1), 'Yevmiye'), true, NEW.id);
  RETURN NEW;
END;
$$;

-- Premium records remain behind the same RLS helper even if a client calls the API directly.
DROP POLICY IF EXISTS "team master or own apprentice read" ON public.work_records;
DROP POLICY IF EXISTS "master operational writes" ON public.work_records;
DROP POLICY IF EXISTS "own exchange-rate snapshot read" ON public.work_records;
DROP POLICY IF EXISTS "own exchange-rate snapshot insert" ON public.work_records;
CREATE POLICY "access scoped work record read" ON public.work_records FOR SELECT TO authenticated
USING (team_id = public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta()) OR
  (owner_id = auth.uid() AND kind IN ('payroll','advance','payment','workplace','settings'))
));
CREATE POLICY "access scoped work record writes" ON public.work_records FOR ALL TO authenticated
USING (team_id = public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta()) OR
  (owner_id = auth.uid() AND kind IN ('payroll','advance','payment','workplace','settings'))
))
WITH CHECK (team_id = public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = owner_id AND p.team_id = public.current_team())) OR
  (owner_id = auth.uid() AND kind IN ('payroll','advance','payment','workplace','settings'))
));

-- Bank account data is premium-only even when a user knows the Supabase endpoint.
DROP POLICY IF EXISTS "users manage only their bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "users manage only their bank movements" ON public.bank_transactions;
DROP POLICY IF EXISTS "users manage only their bank connections" ON public.bank_connections;
DROP POLICY IF EXISTS "users manage only their bank documents" ON public.bank_documents;
CREATE POLICY "premium owner manages bank accounts" ON public.bank_accounts FOR ALL TO authenticated
USING (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team())
WITH CHECK (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team());
CREATE POLICY "premium owner manages bank movements" ON public.bank_transactions FOR ALL TO authenticated
USING (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team()
  AND EXISTS (SELECT 1 FROM public.bank_accounts a WHERE a.id = bank_transactions.account_id AND a.owner_id = auth.uid()))
WITH CHECK (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team()
  AND EXISTS (SELECT 1 FROM public.bank_accounts a WHERE a.id = bank_transactions.account_id AND a.owner_id = auth.uid()));
CREATE POLICY "premium owner manages bank connections" ON public.bank_connections FOR ALL TO authenticated
USING (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team())
WITH CHECK (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team());
CREATE POLICY "premium owner manages bank documents" ON public.bank_documents FOR ALL TO authenticated
USING (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team()
  AND EXISTS (SELECT 1 FROM public.bank_accounts a WHERE a.id = bank_documents.account_id AND a.owner_id = auth.uid())
  AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.bank_transactions t WHERE t.id = bank_documents.transaction_id AND t.account_id = bank_documents.account_id AND t.owner_id = auth.uid())))
WITH CHECK (public.has_full_access() AND owner_id = auth.uid() AND team_id = public.current_team()
  AND EXISTS (SELECT 1 FROM public.bank_accounts a WHERE a.id = bank_documents.account_id AND a.owner_id = auth.uid())
  AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.bank_transactions t WHERE t.id = bank_documents.transaction_id AND t.account_id = bank_documents.account_id AND t.owner_id = auth.uid()))
  AND official = false);

DROP POLICY IF EXISTS "bank document owner upload" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner read" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner delete" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner update" ON storage.objects;
CREATE POLICY "premium bank document upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_full_access());
CREATE POLICY "premium bank document read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_full_access());
CREATE POLICY "premium bank document delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_full_access());
CREATE POLICY "premium bank document update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_full_access())
WITH CHECK (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_full_access());

NOTIFY pgrst, 'reload schema';
