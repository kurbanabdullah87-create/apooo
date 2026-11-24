-- Save public market-rate history through a narrowly scoped RPC so snapshots
-- do not depend on the app's broad work_records write policy.
CREATE OR REPLACE FUNCTION public.save_exchange_rate_snapshot(
  _profile_id uuid,
  _usd numeric,
  _eur numeric,
  _gbp numeric,
  _provider_updated_at text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  team uuid;
  snapshot_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Kur geçmişi için usta oturumu gerekli.';
  END IF;
  IF _usd IS NULL OR _eur IS NULL OR _gbp IS NULL
     OR _usd <= 0 OR _eur <= 0 OR _gbp <= 0
     OR _usd > 1000000 OR _eur > 1000000 OR _gbp > 1000000 THEN
    RAISE EXCEPTION 'Kur sağlayıcısından geçerli bir değer alınamadı.';
  END IF;
  IF coalesce(length(btrim(_provider_updated_at)), 0) = 0
     OR length(_provider_updated_at) > 80 THEN
    RAISE EXCEPTION 'Kur sağlayıcısının güncelleme zamanı geçersiz.';
  END IF;

  team := public.current_team();
  IF team IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.id = _profile_id AND bp.team_id = team AND NOT bp.is_archived
  ) THEN
    RAISE EXCEPTION 'Etkin usta profili bulunamadı; profili yenileyip tekrar deneyin.';
  END IF;

  INSERT INTO public.work_records(team_id, profile_id, owner_id, kind, payload)
  VALUES (
    team,
    _profile_id,
    auth.uid(),
    'exchange_rate',
    jsonb_build_object(
      'base', 'TRY',
      'source', 'mid-market',
      'provider_updated_at', _provider_updated_at,
      'snapshot_at', now(),
      'usd', _usd,
      'eur', _eur,
      'gbp', _gbp
    )
  )
  RETURNING id INTO snapshot_id;

  RETURN snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_exchange_rate_snapshot(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exchange_rate_snapshot(uuid, numeric, numeric, numeric, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
