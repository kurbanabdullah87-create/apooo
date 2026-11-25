-- Free plan keeps a small working core; all other app modules remain visible
-- but are subscription-gated. Replaces the broader owner unlock from 0027.

-- This helper is used throughout privileged RPCs and non-core table policies.
-- Do not treat a free workspace owner as a paid team master here.
CREATE OR REPLACE FUNCTION public.is_team_usta()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_full_access()
$$;
REVOKE ALL ON FUNCTION public.is_team_usta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_usta() TO authenticated, service_role;

-- Profiles are needed to scope free-plan records to the account's default usta.
DROP POLICY IF EXISTS "free owner reads own business profile" ON public.business_profiles;
CREATE POLICY "free owner reads own business profile" ON public.business_profiles
  FOR SELECT TO authenticated
  USING (team_id = auth.uid() AND public.current_team() = auth.uid());

-- A free owner can use the simple customer ledger and expenses.
DROP POLICY IF EXISTS "usta team customers" ON public.customers;
DROP POLICY IF EXISTS "plan scoped customers" ON public.customers;
CREATE POLICY "plan scoped customers" ON public.customers FOR ALL TO authenticated
USING (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()))
WITH CHECK (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()));

DROP POLICY IF EXISTS "usta team transactions" ON public.transactions;
DROP POLICY IF EXISTS "plan scoped transactions" ON public.transactions;
CREATE POLICY "plan scoped transactions" ON public.transactions FOR ALL TO authenticated
USING (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()))
WITH CHECK (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()));

DROP POLICY IF EXISTS "usta team expenses" ON public.expenses;
DROP POLICY IF EXISTS "plan scoped expenses" ON public.expenses;
CREATE POLICY "plan scoped expenses" ON public.expenses FOR ALL TO authenticated
USING (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()))
WITH CHECK (team_id = public.current_team() AND (public.has_full_access() OR public.current_team() = auth.uid()));

-- Free data is restricted to job/payroll/cari settings; equipment, stock,
-- appointments, exchange history and other operational modules require Premium.
DROP POLICY IF EXISTS "owner operational work record read" ON public.work_records;
DROP POLICY IF EXISTS "owner operational work record writes" ON public.work_records;
DROP POLICY IF EXISTS "free core work record read" ON public.work_records;
DROP POLICY IF EXISTS "free core work record writes" ON public.work_records;
CREATE POLICY "free core work record read" ON public.work_records FOR SELECT TO authenticated
USING (team_id = public.current_team() AND (
  public.has_full_access()
  OR (public.current_team() = auth.uid() AND owner_id = auth.uid()
      AND kind IN ('job','payroll','advance','payment','workplace','settings'))
));
CREATE POLICY "free core work record writes" ON public.work_records FOR ALL TO authenticated
USING (team_id = public.current_team() AND (
  public.has_full_access()
  OR (public.current_team() = auth.uid() AND owner_id = auth.uid()
      AND kind IN ('job','payroll','advance','payment','workplace','settings'))
))
WITH CHECK (team_id = public.current_team() AND (
  (public.has_full_access() AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = owner_id AND p.team_id = public.current_team()
  ))
  OR (public.current_team() = auth.uid() AND owner_id = auth.uid()
      AND kind IN ('job','payroll','advance','payment','workplace','settings'))
));

-- The free job-to-cari conversion is part of the usable work/customer core.
CREATE OR REPLACE FUNCTION public.bill_job(_job_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.work_records; c public.customers; result uuid; seconds numeric; amount numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_full_access() OR public.current_team() = auth.uid()) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  SELECT * INTO j FROM public.work_records WHERE id=_job_id AND team_id=public.current_team() AND kind='job' FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'İş bulunamadı'; END IF;
  SELECT id INTO result FROM public.transactions WHERE job_record_id=j.id;
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO c FROM public.customers WHERE id=(j.payload->>'customer_id')::uuid AND team_id=public.current_team();
  IF c.id IS NULL THEN RAISE EXCEPTION 'Müşteri seçin'; END IF;
  seconds:=coalesce((j.payload->>'seconds')::numeric,0);
  IF j.payload->>'started_at' IS NOT NULL THEN seconds:=seconds+greatest(0,extract(epoch FROM now()-(j.payload->>'started_at')::timestamptz)); END IF;
  amount:=CASE WHEN coalesce((j.payload->>'hourly_rate')::numeric,0)>0 THEN round(seconds/3600*(j.payload->>'hourly_rate')::numeric,2) ELSE coalesce((j.payload->>'price')::numeric,0) END;
  IF amount<=0 THEN RAISE EXCEPTION 'İş tutarı sıfır olamaz'; END IF;
  INSERT INTO public.transactions(customer_id,kind,amount,description,material_cost,vat_rate,job_record_id)
  VALUES(c.id,'debt',amount,j.payload->>'title',coalesce((j.payload->>'material_cost')::numeric,0),coalesce((j.payload->>'vat_rate')::smallint,0),j.id)
  RETURNING id INTO result;
  UPDATE public.work_records SET payload=payload||jsonb_build_object('status','Tamamlandı','seconds',seconds,'started_at',null,'billed',true),updated_at=now()
  WHERE id=j.id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.bill_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_job(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_plan_catalog()
RETURNS TABLE(plan_code text, amount numeric, currency text, interval_months integer, features text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.plan_code,p.amount,p.currency,p.interval_months,
    CASE p.plan_code
      WHEN 'free' THEN ARRAY[
        'Panel, işler, cari hesap ve yevmiye kullanılabilir',
        'İş kaydından cari hesaba ücret aktarma',
        'Basit tahsilat ve gider kaydı',
        'Diğer tüm bölümler menüde görünür, Premium ile açılır',
        'Sınırsız süreyle ücretsiz kullanım'
      ]::text[]
      ELSE ARRAY[
        'Ücretsiz plandaki tüm özellikler',
        'Banka hesap hareketleri ve banka raporları',
        'Borç, taksit ve kredi kartı ödeme planları',
        'Randevu, ekipman, stok, hava ve gelişmiş raporlama',
        'Premium modüllere tam erişim'
      ]::text[]
    END
  FROM public.plan_pricing p
  ORDER BY CASE p.plan_code WHEN 'free' THEN 0 WHEN 'premium_monthly' THEN 1 ELSE 2 END;
$$;

NOTIFY pgrst, 'reload schema';
