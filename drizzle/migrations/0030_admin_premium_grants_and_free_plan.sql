-- Administrator-managed complimentary Premium access. This is kept separate
-- from paid entitlements so a gift never overwrites or cancels a purchase.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_plan_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'premium_annual' CHECK (plan_code IN ('premium_monthly','premium_annual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
ALTER TABLE public.admin_plan_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_plan_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_plan_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_plan_grants TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_plan_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('grant','extend','revoke')),
  plan_code text CHECK (plan_code IN ('premium_monthly','premium_annual')),
  days integer CHECK (days IS NULL OR days BETWEEN 0 AND 3650),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_plan_grant_events_created_idx
  ON public.admin_plan_grant_events(created_at DESC);
ALTER TABLE public.admin_plan_grant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_plan_grant_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_plan_grant_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_plan_grant_events TO service_role;

CREATE OR REPLACE FUNCTION public.has_full_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM auth.users u JOIN public.authorized_emails a ON a.email=lower(u.email)
      WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND a.enabled
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.plan_entitlements e
      WHERE e.user_id=auth.uid() AND e.status='active' AND e.starts_at<=now() AND e.expires_at>now()
    ) OR EXISTS (
      SELECT 1 FROM public.admin_plan_grants g
      WHERE g.user_id=auth.uid() AND g.status='active' AND g.starts_at<=now()
        AND (g.expires_at IS NULL OR g.expires_at>now())
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_access()
RETURNS TABLE(is_admin boolean, is_premium boolean, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_app_admin(), public.has_full_access(),
    CASE WHEN EXISTS (SELECT 1 FROM public.admin_plan_grants g WHERE g.user_id=auth.uid() AND g.status='active' AND g.starts_at<=now() AND g.expires_at IS NULL)
      THEN NULL::timestamptz
      ELSE greatest(
        (SELECT max(e.expires_at) FROM public.plan_entitlements e WHERE e.user_id=auth.uid() AND e.status='active' AND e.starts_at<=now() AND e.expires_at>now()),
        (SELECT max(g.expires_at) FROM public.admin_plan_grants g WHERE g.user_id=auth.uid() AND g.status='active' AND g.starts_at<=now() AND g.expires_at>now())
      )
    END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_user_plan_access(_search text DEFAULT '')
RETURNS TABLE(
  user_id uuid, email text, display_name text, username text, email_confirmed boolean,
  is_admin boolean, is_authorized boolean, has_premium boolean, access_source text,
  premium_expires_at timestamptz, grant_reason text, grant_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE search_term text := lower(btrim(coalesce(_search,'')));
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Bu liste yalnızca yöneticiye açıktır.'; END IF;
  IF length(search_term)>120 THEN RAISE EXCEPTION 'Arama en fazla 120 karakter olabilir.'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, p.display_name::text, p.username::text,
    u.email_confirmed_at IS NOT NULL,
    (coalesce(a.is_admin,false) AND coalesce(a.enabled,false)), coalesce(a.enabled,false),
    (coalesce(a.enabled,false) OR coalesce(e.is_active,false) OR coalesce(g.is_active,false)),
    CASE WHEN coalesce(a.is_admin,false) AND coalesce(a.enabled,false) THEN 'Yönetici'
      WHEN coalesce(a.enabled,false) THEN 'Yetkili hesap'
      WHEN coalesce(e.is_active,false) THEN 'Ücretli Premium'
      WHEN coalesce(g.is_active,false) THEN 'Ücretsiz yönetici Premium erişimi'
      ELSE 'Ücretsiz plan' END,
    CASE WHEN coalesce(g.is_perpetual,false) THEN NULL::timestamptz
      ELSE greatest(e.expires_at, g.expires_at) END,
    g.reason, g.status
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id=u.id
  LEFT JOIN public.authorized_emails a ON a.email=lower(u.email)
  LEFT JOIN LATERAL (
    SELECT true AS is_active, max(pe.expires_at) AS expires_at
    FROM public.plan_entitlements pe
    WHERE pe.user_id=u.id AND pe.status='active' AND pe.starts_at<=now() AND pe.expires_at>now()
    HAVING count(*)>0
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT true AS is_active, bool_or(ag.expires_at IS NULL) AS is_perpetual,
      max(ag.expires_at) AS expires_at, max(ag.reason) AS reason, max(ag.status) AS status
    FROM public.admin_plan_grants ag
    WHERE ag.user_id=u.id AND ag.status='active' AND ag.starts_at<=now()
      AND (ag.expires_at IS NULL OR ag.expires_at>now())
    HAVING count(*)>0
  ) g ON true
  WHERE search_term='' OR lower(coalesce(u.email,'')) LIKE '%'||search_term||'%'
    OR lower(coalesce(p.display_name,'')) LIKE '%'||search_term||'%'
    OR lower(coalesce(p.username,'')) LIKE '%'||search_term||'%'
  ORDER BY u.created_at DESC LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_premium(
  _user_id uuid, _action text, _plan_code text DEFAULT 'premium_annual',
  _days integer DEFAULT 30, _reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_email text; normalized_reason text := btrim(coalesce(_reason,''));
  current_expiry timestamptz; current_start timestamptz; next_start timestamptz; action_name text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Bu işlem yalnızca yönetici tarafından yapılabilir.'; END IF;
  IF _action NOT IN ('grant','extend','revoke') THEN RAISE EXCEPTION 'Geçersiz yönetici plan işlemi.'; END IF;
  IF length(normalized_reason) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'İşlem gerekçesi 5–500 karakter olmalıdır.'; END IF;
  SELECT u.email INTO target_email FROM auth.users u
    WHERE u.id=_user_id AND u.email_confirmed_at IS NOT NULL FOR UPDATE;
  IF target_email IS NULL THEN RAISE EXCEPTION 'Doğrulanmış kullanıcı hesabı bulunamadı.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text, 0));

  IF _action IN ('grant','extend') THEN
    IF _plan_code NOT IN ('premium_monthly','premium_annual') THEN RAISE EXCEPTION 'Premium plan türünü seçin.'; END IF;
    IF _days NOT BETWEEN 0 AND 3650 THEN RAISE EXCEPTION 'Süre süresiz veya 1–3650 gün olmalıdır.'; END IF;
    SELECT g.expires_at,g.starts_at INTO current_expiry,current_start FROM public.admin_plan_grants g
      WHERE g.user_id=_user_id AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now()) FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.admin_plan_grants g WHERE g.user_id=_user_id AND g.status='active' AND g.expires_at IS NULL) THEN
      current_expiry := 'infinity'::timestamptz;
    END IF;
    next_start := coalesce(current_start,now());
    INSERT INTO public.admin_plan_grants(user_id,plan_code,status,starts_at,expires_at,reason,granted_by,updated_at)
    VALUES (_user_id,_plan_code,'active',next_start,
      CASE WHEN _days=0 OR current_expiry='infinity'::timestamptz THEN NULL ELSE greatest(now(),coalesce(current_expiry,now()))+make_interval(days=>_days) END,
      normalized_reason,auth.uid(),now())
    ON CONFLICT (user_id) DO UPDATE SET plan_code=excluded.plan_code,status='active',
      starts_at=excluded.starts_at,expires_at=excluded.expires_at,reason=excluded.reason,
      granted_by=excluded.granted_by,updated_at=now();
    action_name := CASE WHEN _action='extend' OR current_expiry IS NOT NULL THEN 'extend' ELSE 'grant' END;
    INSERT INTO public.admin_plan_grant_events(user_id,actor_id,action,plan_code,days,reason)
      VALUES (_user_id,auth.uid(),action_name,_plan_code,_days,normalized_reason);
  ELSE
    UPDATE public.admin_plan_grants SET status='revoked',updated_at=now()
      WHERE user_id=_user_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcının iptal edilecek bir yönetici Premium erişimi yok.'; END IF;
    INSERT INTO public.admin_plan_grant_events(user_id,actor_id,action,reason)
      VALUES (_user_id,auth.uid(),'revoke',normalized_reason);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_plan_grant_events(_limit integer DEFAULT 30)
RETURNS TABLE(email text, actor_email text, action text, plan_code text, days integer, reason text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Bu kayıtlar yalnızca yöneticiye açıktır.'; END IF;
  RETURN QUERY SELECT target.email::text, actor.email::text, ev.action, ev.plan_code, ev.days, ev.reason, ev.created_at
    FROM public.admin_plan_grant_events ev
    JOIN auth.users target ON target.id=ev.user_id
    JOIN auth.users actor ON actor.id=ev.actor_id
    ORDER BY ev.created_at DESC LIMIT greatest(1,least(coalesce(_limit,30),100));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_catalog()
RETURNS TABLE(plan_code text, amount numeric, currency text, interval_months integer, features text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.plan_code,p.amount,p.currency,p.interval_months,
    CASE p.plan_code
      WHEN 'free' THEN ARRAY[
        'Süresiz ücretsiz kullanım; temel saha iş akışı',
        'Panelde günlük işler, tahsilat ve gider özeti',
        'İş oluşturma, müşteriyle ilişkilendirme, zaman takibi ve iş durumları',
        'Cari müşteri kartları, borç ve tahsilat kayıtları',
        'İş ücretini tek adımla cari hesaba aktarma',
        'Temel yevmiye, avans ve ödeme takibi',
        'Temel gider kaydı ve işletme bilgileri',
        'Diğer modüller uygulamada görünür; Premium erişimi gerektirir'
      ]::text[]
      ELSE ARRAY[
        'Ücretsiz plandaki tüm özellikler',
        'Yönetici tarafından süreli veya süresiz ücretsiz Premium erişimi verilebilir',
        'Banka hareketleri kasası ve ayrıntılı banka raporları',
        'Taksit, borç/alacak ve kredi kartı ödeme planları',
        'Randevu, ekipman, bakım, puantaj ve stok yönetimi',
        'Gelişmiş raporlama, birden çok işletme profili ve saha araçları'
      ]::text[]
    END
  FROM public.plan_pricing p
  ORDER BY CASE p.plan_code WHEN 'free' THEN 0 WHEN 'premium_monthly' THEN 1 ELSE 2 END;
$$;

REVOKE ALL ON FUNCTION public.has_full_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_user_plan_access(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_premium(uuid,text,text,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_plan_grant_events(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_full_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_plan_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_premium(uuid,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_plan_grant_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_catalog() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
