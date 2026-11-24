-- Minimal product-usage analytics. Never store transaction, bank, email, or form contents.
CREATE TABLE IF NOT EXISTS public.app_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('session_start', 'page_view')),
  module text NOT NULL CHECK (module IN ('app','panel','isler','cari','yevmiye','ekipman','doviz','banka','randevu','rapor','ayarlar','premium','giderler','alim','borc','puantaj','hava','hesaplayici','other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_usage_events_time_idx ON public.app_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_usage_events_user_time_idx ON public.app_usage_events (user_id, created_at DESC);
ALTER TABLE public.app_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_usage_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_app_usage(_event_type text, _module text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE safe_module text := lower(coalesce(_module, 'other'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum gerekli'; END IF;
  IF _event_type NOT IN ('session_start','page_view') THEN RAISE EXCEPTION 'Geçersiz etkinlik'; END IF;
  IF safe_module NOT IN ('app','panel','isler','cari','yevmiye','ekipman','doviz','banka','randevu','rapor','ayarlar','premium','giderler','alim','borc','puantaj','hava','hesaplayici','other') THEN safe_module := 'other'; END IF;
  IF _event_type = 'session_start' THEN safe_module := 'app'; END IF;
  -- Dedupe rapid refreshes/navigation loops; retain only coarse module-level usage.
  IF EXISTS (SELECT 1 FROM public.app_usage_events e WHERE e.user_id=auth.uid() AND e.event_type=_event_type AND e.module=safe_module AND e.created_at > now() - interval '60 seconds') THEN RETURN; END IF;
  INSERT INTO public.app_usage_events(user_id,event_type,module) VALUES (auth.uid(),_event_type,safe_module);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_usage_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  WITH bounds AS (
    SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS day_start,
           (date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS month_start
  ), periods AS (
    SELECT 'day' AS k, day_start AS since FROM bounds UNION ALL
    SELECT 'month', month_start FROM bounds UNION ALL SELECT 'all', '-infinity'::timestamptz
  ), totals AS (
    SELECT p.k, count(DISTINCT e.user_id)::int AS users,
      count(*) FILTER (WHERE e.event_type='session_start')::int AS sessions,
      count(*) FILTER (WHERE e.event_type='page_view')::int AS views
    FROM periods p LEFT JOIN public.app_usage_events e ON e.created_at >= p.since GROUP BY p.k
  ), daily AS (
    SELECT d::date AS day, count(DISTINCT e.user_id)::int AS users,
      count(*) FILTER (WHERE e.event_type='page_view')::int AS views
    FROM generate_series((now() AT TIME ZONE 'Europe/Istanbul')::date - 29, (now() AT TIME ZONE 'Europe/Istanbul')::date, interval '1 day') d
    LEFT JOIN public.app_usage_events e ON (e.created_at AT TIME ZONE 'Europe/Istanbul')::date=d::date
    GROUP BY d
  ), modules AS (
    SELECT module, count(*)::int AS views FROM public.app_usage_events WHERE event_type='page_view' GROUP BY module ORDER BY views DESC
  ), users AS (
    SELECT u.id, lower(u.email) AS email, max(e.created_at) AS last_seen,
      count(*) FILTER (WHERE e.event_type='session_start')::int AS sessions,
      count(*) FILTER (WHERE e.event_type='page_view')::int AS views
    FROM auth.users u JOIN public.app_usage_events e ON e.user_id=u.id
    WHERE u.email_confirmed_at IS NOT NULL GROUP BY u.id,u.email ORDER BY max(e.created_at) DESC LIMIT 100
  )
  SELECT jsonb_build_object(
    'day', (SELECT to_jsonb(t) - 'k' FROM totals t WHERE k='day'),
    'month', (SELECT to_jsonb(t) - 'k' FROM totals t WHERE k='month'),
    'all_time', (SELECT to_jsonb(t) - 'k' FROM totals t WHERE k='all'),
    'daily', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM daily d),'[]'::jsonb),
    'modules', coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM modules m),'[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'last_seen',last_seen,'sessions',sessions,'views',views)) FROM users),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_app_usage(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_usage(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_summary() TO authenticated;
