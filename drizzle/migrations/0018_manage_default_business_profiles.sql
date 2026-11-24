-- Let team owners choose the default profile and safely remove profiles from
-- active use. Historical work and finance rows remain attached to their
-- original profile; removal is an archive, never a destructive delete.

CREATE OR REPLACE FUNCTION public.protect_default_business_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default AND NEW.is_archived THEN
    RAISE EXCEPTION 'Arşivlenmiş profil varsayılan olamaz.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_business_profile(_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  team uuid;
  chosen uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.has_role(actor, 'usta') THEN
    RAISE EXCEPTION 'Bu işlem yalnızca kendi çalışma alanının sahibi tarafından yapılabilir.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp
    WHERE bp.team_id = team ORDER BY bp.id FOR UPDATE;

  SELECT bp.id INTO chosen
    FROM public.business_profiles bp
    WHERE bp.id = _profile_id AND bp.team_id = team AND NOT bp.is_archived;
  IF chosen IS NULL THEN
    RAISE EXCEPTION 'Etkin profil bulunamadı.';
  END IF;

  UPDATE public.business_profiles
    SET is_default = false
    WHERE team_id = team AND is_default AND id <> chosen;
  UPDATE public.business_profiles
    SET is_default = true
    WHERE id = chosen AND team_id = team AND NOT is_default;

  RETURN chosen;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_business_profile(_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  team uuid;
  target_default boolean;
  target_archived boolean;
  replacement uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.has_role(actor, 'usta') THEN
    RAISE EXCEPTION 'Bu işlem yalnızca kendi çalışma alanının sahibi tarafından yapılabilir.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp
    WHERE bp.team_id = team ORDER BY bp.id FOR UPDATE;

  SELECT bp.is_default, bp.is_archived INTO target_default, target_archived
    FROM public.business_profiles bp
    WHERE bp.id = _profile_id AND bp.team_id = team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil bulunamadı.';
  END IF;
  IF target_archived THEN
    SELECT bp.id INTO replacement FROM public.business_profiles bp
      WHERE bp.team_id = team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
    RETURN replacement;
  END IF;

  IF target_default THEN
    SELECT bp.id INTO replacement
      FROM public.business_profiles bp
      WHERE bp.team_id = team AND bp.id <> _profile_id AND NOT bp.is_archived
      ORDER BY bp.created_at, bp.id
      LIMIT 1;
    IF replacement IS NULL THEN
      RAISE EXCEPTION 'Son etkin profil kaldırılamaz. Önce yeni bir profil oluşturun.';
    END IF;
    UPDATE public.business_profiles SET is_default = false
      WHERE id = _profile_id AND team_id = team;
    UPDATE public.business_profiles SET is_default = true
      WHERE id = replacement AND team_id = team;
  ELSE
    SELECT bp.id INTO replacement FROM public.business_profiles bp
      WHERE bp.team_id = team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
  END IF;

  UPDATE public.business_profiles SET is_archived = true
    WHERE id = _profile_id AND team_id = team;
  RETURN replacement;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_business_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_business_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_business_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_business_profile(uuid) TO authenticated;
