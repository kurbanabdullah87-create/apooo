-- Avoid accessing table-specific trigger fields from a shared boolean expression.
-- PostgreSQL may reorder AND terms, so NEW.job_record_id can otherwise be
-- evaluated for work_records rows, where the field does not exist.
CREATE OR REPLACE FUNCTION public.assign_and_validate_business_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked_profile uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.profile_id IS DISTINCT FROM NEW.profile_id THEN
    RAISE EXCEPTION 'Kayıt başka bir usta profiline taşınamaz.';
  END IF;

  IF TG_TABLE_NAME = 'work_records' THEN
    IF NEW.kind = 'settings' THEN
      NEW.profile_id := NULL;
      RETURN NEW;
    END IF;

    IF NEW.profile_id IS NULL AND NEW.kind = 'job'
       AND NEW.payload->>'appointment_id' IS NOT NULL THEN
      SELECT profile_id INTO linked_profile
      FROM public.work_records
      WHERE id = public.try_uuid(NEW.payload->>'appointment_id')
        AND team_id = NEW.team_id
        AND kind = 'shopping'
        AND payload->>'_t' = 'appointment';
      NEW.profile_id := linked_profile;
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.profile_id IS NULL AND NEW.job_record_id IS NOT NULL THEN
      SELECT profile_id INTO linked_profile
      FROM public.work_records
      WHERE id = NEW.job_record_id AND team_id = NEW.team_id;
      NEW.profile_id := linked_profile;
    END IF;
  ELSIF TG_TABLE_NAME <> 'expenses' THEN
    RAISE EXCEPTION 'Desteklenmeyen profil tablosu: %', TG_TABLE_NAME;
  END IF;

  IF NEW.profile_id IS NULL THEN
    SELECT id INTO NEW.profile_id
    FROM public.business_profiles
    WHERE team_id = NEW.team_id AND is_default AND NOT is_archived
    LIMIT 1;
  END IF;

  IF NEW.profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.id = NEW.profile_id
      AND bp.team_id = NEW.team_id
      AND (TG_OP = 'UPDATE' OR NOT bp.is_archived)
  ) THEN
    RAISE EXCEPTION 'Geçerli ve etkin bir usta profili seçin.';
  END IF;

  RETURN NEW;
END;
$$;
