-- Multiple business/usta contexts within one existing team. Team ownership and
-- the existing RLS model remain unchanged; profile_id is only a scoped label.
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text,
  logo_url text,
  phone text,
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','USD','EUR','GBP')),
  default_hourly_rate numeric(12,2) CHECK (default_hourly_rate IS NULL OR default_hourly_rate >= 0),
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  holidays jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text NOT NULL DEFAULT 'teal',
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, id),
  CHECK (NOT is_default OR NOT is_archived)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_one_default_per_team
  ON public.business_profiles(team_id) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_name_per_team
  ON public.business_profiles(team_id, lower(name)) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS business_profiles_team_active
  ON public.business_profiles(team_id, is_archived, name);

GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
GRANT ALL ON public.business_profiles TO service_role;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team owner reads business profiles" ON public.business_profiles
  FOR SELECT TO authenticated USING (team_id = public.current_team() AND public.is_team_usta());
CREATE POLICY "team owner creates business profiles" ON public.business_profiles
  FOR INSERT TO authenticated WITH CHECK (
    team_id = public.current_team() AND public.is_team_usta() AND auth.uid() = team_id AND created_by = auth.uid()
  );
CREATE POLICY "team owner updates business profiles" ON public.business_profiles
  FOR UPDATE TO authenticated USING (
    team_id = public.current_team() AND public.is_team_usta() AND auth.uid() = team_id
  ) WITH CHECK (
    team_id = public.current_team() AND public.is_team_usta() AND auth.uid() = team_id AND created_by = auth.uid()
  );

CREATE TABLE public.business_profile_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('created','updated','archived','restored')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (team_id, profile_id) REFERENCES public.business_profiles(team_id, id) ON DELETE RESTRICT
);
GRANT SELECT ON public.business_profile_audit TO authenticated;
ALTER TABLE public.business_profile_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team owner reads profile audit" ON public.business_profile_audit
  FOR SELECT TO authenticated USING (team_id = public.current_team() AND public.is_team_usta());
CREATE OR REPLACE FUNCTION public.audit_business_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE audit_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audit_action := 'created';
  ELSIF OLD.is_archived IS DISTINCT FROM NEW.is_archived THEN
    audit_action := CASE WHEN NEW.is_archived THEN 'archived' ELSE 'restored' END;
  ELSE
    audit_action := 'updated';
  END IF;
  INSERT INTO public.business_profile_audit(team_id, profile_id, actor_id, action)
  VALUES (NEW.team_id, NEW.id, coalesce(auth.uid(), NEW.created_by), audit_action);
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_business_profile AFTER INSERT OR UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_business_profile_change();
CREATE OR REPLACE FUNCTION public.protect_default_business_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_default AND (NOT NEW.is_default OR NEW.is_archived) THEN
    RAISE EXCEPTION 'Varsayılan usta profili arşivlenemez veya varsayılanlıktan çıkarılamaz.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_default_business_profile BEFORE UPDATE OF is_default, is_archived
  ON public.business_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_default_business_profile();
CREATE OR REPLACE FUNCTION public.touch_business_profile_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER touch_business_profile_updated_at BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_business_profile_updated_at();

-- Provision one stable default profile for each existing team owner.
INSERT INTO public.business_profiles(team_id, name, is_default, created_by)
SELECT p.id, coalesce(nullif(btrim(p.display_name), ''), p.username, 'Usta'), true, p.id
FROM public.profiles p
WHERE p.id = p.team_id AND public.has_role(p.id, 'usta')
ON CONFLICT DO NOTHING;

-- Earlier versions stored additional usta names as newline-separated labels.
-- Preserve each as its own profile; old transactions remain on the default.
INSERT INTO public.business_profiles(team_id, name, created_by)
SELECT DISTINCT s.team_id, btrim(alias.name), s.owner_id
FROM public.work_records s
CROSS JOIN LATERAL regexp_split_to_table(coalesce(s.payload->>'master_names', ''), E'\\r?\\n') AS alias(name)
WHERE s.kind = 'settings' AND length(btrim(alias.name)) BETWEEN 1 AND 100
  AND NOT EXISTS (SELECT 1 FROM public.business_profiles bp WHERE bp.team_id = s.team_id AND lower(bp.name) = lower(btrim(alias.name)))
ON CONFLICT DO NOTHING;

-- Ensure accounts created after this migration also receive a default profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, team_id)
  VALUES (NEW.id,
    lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))),
    coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username'),
    NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'usta');
  INSERT INTO public.business_profiles (team_id, name, is_default, created_by)
  VALUES (NEW.id, coalesce(nullif(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    nullif(NEW.raw_user_meta_data->>'username', ''), split_part(NEW.email, '@', 1), 'Usta'), true, NEW.id);
  RETURN NEW;
END;
$$;

ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS profile_id uuid;

UPDATE public.work_records w SET profile_id = bp.id
FROM public.business_profiles bp
WHERE w.team_id = bp.team_id AND bp.is_default AND w.kind <> 'settings' AND w.profile_id IS NULL;
UPDATE public.transactions t SET profile_id = bp.id
FROM public.business_profiles bp WHERE t.team_id = bp.team_id AND bp.is_default AND t.profile_id IS NULL;
UPDATE public.expenses e SET profile_id = bp.id
FROM public.business_profiles bp WHERE e.team_id = bp.team_id AND bp.is_default AND e.profile_id IS NULL;

ALTER TABLE public.work_records ADD CONSTRAINT work_records_profile_team_fk
  FOREIGN KEY (team_id, profile_id) REFERENCES public.business_profiles(team_id, id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_profile_team_fk
  FOREIGN KEY (team_id, profile_id) REFERENCES public.business_profiles(team_id, id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_profile_team_fk
  FOREIGN KEY (team_id, profile_id) REFERENCES public.business_profiles(team_id, id);
CREATE INDEX IF NOT EXISTS work_records_team_profile_kind_created
  ON public.work_records(team_id, profile_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_team_profile_date
  ON public.transactions(team_id, profile_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS expenses_team_profile_date
  ON public.expenses(team_id, profile_id, occurred_on DESC);

CREATE OR REPLACE FUNCTION public.assign_and_validate_business_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked_profile uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.profile_id IS DISTINCT FROM NEW.profile_id THEN
    RAISE EXCEPTION 'Kayıt başka bir usta profiline taşınamaz.';
  END IF;
  IF TG_TABLE_NAME = 'work_records' AND NEW.kind = 'settings' THEN
    NEW.profile_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.profile_id IS NULL AND TG_TABLE_NAME = 'transactions' AND NEW.job_record_id IS NOT NULL THEN
    SELECT profile_id INTO linked_profile FROM public.work_records
      WHERE id = NEW.job_record_id AND team_id = NEW.team_id;
    NEW.profile_id := linked_profile;
  END IF;
  IF NEW.profile_id IS NULL AND TG_TABLE_NAME = 'work_records' AND NEW.kind = 'job'
     AND NEW.payload->>'appointment_id' IS NOT NULL THEN
    SELECT profile_id INTO linked_profile FROM public.work_records
      WHERE id = public.try_uuid(NEW.payload->>'appointment_id') AND team_id = NEW.team_id
        AND kind = 'shopping' AND payload->>'_t' = 'appointment';
    NEW.profile_id := linked_profile;
  END IF;
  IF NEW.profile_id IS NULL THEN
    SELECT id INTO NEW.profile_id FROM public.business_profiles
      WHERE team_id = NEW.team_id AND is_default AND NOT is_archived LIMIT 1;
  END IF;
  IF NEW.profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.id = NEW.profile_id AND bp.team_id = NEW.team_id
      AND (TG_OP = 'UPDATE' OR NOT bp.is_archived)
  ) THEN
    RAISE EXCEPTION 'Geçerli ve etkin bir usta profili seçin.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assign_profile_work_records BEFORE INSERT OR UPDATE
  ON public.work_records FOR EACH ROW EXECUTE FUNCTION public.assign_and_validate_business_profile();
CREATE TRIGGER assign_profile_transactions BEFORE INSERT OR UPDATE
  ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.assign_and_validate_business_profile();
CREATE TRIGGER assign_profile_expenses BEFORE INSERT OR UPDATE
  ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.assign_and_validate_business_profile();

