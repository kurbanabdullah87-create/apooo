-- Repair teams missed by 0016_business_profiles.sql. That migration called
-- has_role() without an authenticated JWT; the hardened function correctly
-- returned false, so owner profiles and their existing records were skipped.
-- This migration runs as the database migration role and reads the role table
-- directly. Only existing usta owners' own teams are eligible for backfill.

INSERT INTO public.business_profiles(team_id, name, is_default, created_by)
SELECT p.id,
       coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'Usta'),
       true,
       p.id
FROM public.profiles p
WHERE p.id = p.team_id
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'usta'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.team_id = p.id AND bp.is_default
  )
ON CONFLICT DO NOTHING;

-- A team may already have a named profile but no default due to a prior
-- interrupted/manual setup. Promote its oldest active profile as default.
WITH teams_without_default AS (
  SELECT DISTINCT p.id AS team_id
  FROM public.profiles p
  WHERE p.id = p.team_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'usta'
    )
    AND EXISTS (
      SELECT 1 FROM public.work_records w
      WHERE w.team_id = p.id AND w.kind <> 'settings' AND w.profile_id IS NULL
      UNION ALL
      SELECT 1 FROM public.transactions t WHERE t.team_id = p.id AND t.profile_id IS NULL
      UNION ALL
      SELECT 1 FROM public.expenses e WHERE e.team_id = p.id AND e.profile_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.business_profiles bp
      WHERE bp.team_id = p.id AND bp.is_default
    )
), candidates AS (
  SELECT DISTINCT ON (bp.team_id) bp.team_id, bp.id
  FROM public.business_profiles bp
  JOIN teams_without_default t ON t.team_id = bp.team_id
  WHERE NOT bp.is_archived
  ORDER BY bp.team_id, bp.created_at, bp.id
)
UPDATE public.business_profiles bp
SET is_default = true
FROM candidates c
WHERE bp.id = c.id;

UPDATE public.work_records w
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE w.team_id = bp.team_id
  AND bp.is_default
  AND w.kind <> 'settings'
  AND w.profile_id IS NULL;

UPDATE public.transactions t
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE t.team_id = bp.team_id
  AND bp.is_default
  AND t.profile_id IS NULL;

UPDATE public.expenses e
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE e.team_id = bp.team_id
  AND bp.is_default
  AND e.profile_id IS NULL;
