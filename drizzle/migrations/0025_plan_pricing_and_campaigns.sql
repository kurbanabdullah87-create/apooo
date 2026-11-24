-- User-visible pricing and admin-managed campaigns. Checkout remains disabled
-- until a payment provider verifies orders server-side.
ALTER TABLE public.plan_entitlements
  DROP CONSTRAINT IF EXISTS plan_entitlements_plan_code_check;
ALTER TABLE public.plan_entitlements
  ADD CONSTRAINT plan_entitlements_plan_code_check
  CHECK (plan_code IN ('premium_monthly','premium_annual'));

CREATE TABLE IF NOT EXISTS public.plan_pricing (
  plan_code text PRIMARY KEY CHECK (plan_code IN ('free','premium_monthly','premium_annual')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  interval_months integer NOT NULL CHECK (interval_months >= 0 AND interval_months <= 12),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((plan_code='free' AND amount=0 AND interval_months=0) OR (plan_code='premium_monthly' AND interval_months=1) OR (plan_code='premium_annual' AND interval_months=12))
);
ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_pricing FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_pricing FROM anon, authenticated;
GRANT ALL ON public.plan_pricing TO service_role;

INSERT INTO public.plan_pricing(plan_code,amount,currency,interval_months)
VALUES ('free',0,'TRY',0),('premium_monthly',39.90,'TRY',1),('premium_annual',300,'TRY',12)
ON CONFLICT (plan_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.plan_campaigns (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 240),
  discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 80),
  applies_to text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','premium_monthly','premium_annual')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '366 days')
);
ALTER TABLE public.plan_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_campaigns FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_campaigns FROM anon, authenticated;
GRANT ALL ON public.plan_campaigns TO service_role;

CREATE OR REPLACE FUNCTION public.get_plan_catalog()
RETURNS TABLE(plan_code text, amount numeric, currency text, interval_months integer, features text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.plan_code,p.amount,p.currency,p.interval_months,
    CASE p.plan_code
      WHEN 'free' THEN ARRAY['Kişisel yevmiye takvimi ve kendi kayıtların','Tam, yarım ve çeyrek gün çalışma kaydı','Kendi işyeri ve ücret kartların','Aylık yevmiye, avans ve ödeme özeti','Yevmiye PDF raporu','Banka ve taksit ekranlarında örnek demo']::text[]
      ELSE ARRAY['Ücretsiz plandaki tüm özellikler','Banka hareketleri, aylık özet ve detaylı PDF raporu','Taksit, borç/alacak ve hatırlatmalar','Randevu takvimi ve müşteri yönetimi','Makbuz, cari hareketler ve gelişmiş raporlar','Ekip ve birden fazla işletme profili']::text[]
    END
  FROM public.plan_pricing p
  ORDER BY CASE p.plan_code WHEN 'free' THEN 0 WHEN 'premium_monthly' THEN 1 ELSE 2 END;
$$;

CREATE OR REPLACE FUNCTION public.list_plan_campaigns()
RETURNS TABLE(id uuid,title text,description text,discount_percent integer,applies_to text,starts_at timestamptz,ends_at timestamptz,enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum gerekli.'; END IF;
  RETURN QUERY SELECT c.id,c.title,c.description,c.discount_percent,c.applies_to,c.starts_at,c.ends_at,c.enabled
    FROM public.plan_campaigns c
    WHERE (public.is_app_admin()) OR (c.enabled AND c.starts_at <= now() AND c.ends_at > now())
    ORDER BY c.starts_at DESC,c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_plan_campaign(
  _id uuid,_title text,_description text,_discount_percent integer,_applies_to text,
  _starts_at timestamptz,_ends_at timestamptz,_enabled boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result_id uuid;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yalnızca yönetici kampanya ayarlayabilir.'; END IF;
  IF length(btrim(coalesce(_title,''))) NOT BETWEEN 3 AND 80
    OR length(coalesce(_description,'')) > 240
    OR _discount_percent NOT BETWEEN 1 AND 80
    OR coalesce(_applies_to,'') NOT IN ('all','premium_monthly','premium_annual')
    OR _starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= _starts_at
    OR _ends_at > _starts_at + interval '366 days' THEN
    RAISE EXCEPTION 'Kampanya alanlarını ve tarih aralığını kontrol edin.';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.plan_campaigns(title,description,discount_percent,applies_to,starts_at,ends_at,enabled,created_by)
      VALUES(btrim(_title),btrim(coalesce(_description,'')),_discount_percent,_applies_to,_starts_at,_ends_at,_enabled,auth.uid())
      RETURNING id INTO result_id;
  ELSE
    UPDATE public.plan_campaigns SET title=btrim(_title),description=btrim(coalesce(_description,'')),discount_percent=_discount_percent,
      applies_to=_applies_to,starts_at=_starts_at,ends_at=_ends_at,enabled=_enabled,updated_at=now()
      WHERE id=_id RETURNING id INTO result_id;
    IF result_id IS NULL THEN RAISE EXCEPTION 'Kampanya bulunamadı.'; END IF;
  END IF;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_plan_campaign(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yalnızca yönetici kampanya silebilir.'; END IF;
  DELETE FROM public.plan_campaigns WHERE id=_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_plan_price(_plan_code text,_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yalnızca yönetici fiyat belirleyebilir.'; END IF;
  IF _plan_code NOT IN ('premium_monthly','premium_annual') OR _amount < 1 OR _amount > 100000 THEN
    RAISE EXCEPTION 'Geçersiz plan fiyatı.';
  END IF;
  UPDATE public.plan_pricing SET amount=round(_amount,2),updated_by=auth.uid(),updated_at=now() WHERE plan_code=_plan_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_plan_catalog() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_plan_campaigns() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_plan_campaign(uuid,text,text,integer,text,timestamptz,timestamptz,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_plan_campaign(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_plan_price(text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_plan_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_plan_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_plan_campaign(uuid,text,text,integer,text,timestamptz,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_plan_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_plan_price(text,numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
