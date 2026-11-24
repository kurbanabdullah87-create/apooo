-- Provision a default profile for each existing team owner and assign legacy
-- records to that team's default. Keep the mapping strictly within team_id.
-- Do not call has_role() here: its hardened implementation intentionally only
-- returns true for auth.uid(), which is unset during a deployment migration.
INSERT INTO public.business_profiles(team_id, name, is_default, created_by)
SELECT p.id,
       coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'Usta'),
       true,
       p.id
FROM public.profiles p
WHERE p.id = p.team_id
  AND NOT EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.team_id = p.id AND bp.is_default
  )
ON CONFLICT DO NOTHING;

UPDATE public.work_records w
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE w.team_id = bp.team_id
  AND bp.is_default
  AND NOT bp.is_archived
  AND w.kind <> 'settings'
  AND w.profile_id IS NULL;

UPDATE public.transactions t
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE t.team_id = bp.team_id
  AND bp.is_default
  AND NOT bp.is_archived
  AND t.profile_id IS NULL;

UPDATE public.expenses e
SET profile_id = bp.id
FROM public.business_profiles bp
WHERE e.team_id = bp.team_id
  AND bp.is_default
  AND NOT bp.is_archived
  AND e.profile_id IS NULL;
