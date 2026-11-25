-- Free workspace owners can use the operational app. Bank and installment data
-- stay subscription-gated at the database layer as well as in the UI.
CREATE OR REPLACE FUNCTION public.is_team_usta()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND (public.current_team() = auth.uid() OR public.has_full_access());
$$;
REVOKE ALL ON FUNCTION public.is_team_usta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_usta() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_default_business_profile(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); team uuid; chosen uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Bu işlem yalnızca çalışma alanı sahibi tarafından yapılabilir.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp WHERE bp.team_id=team ORDER BY bp.id FOR UPDATE;
  SELECT bp.id INTO chosen FROM public.business_profiles bp WHERE bp.id=_profile_id AND bp.team_id=team AND NOT bp.is_archived;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Etkin profil bulunamadı.'; END IF;
  UPDATE public.business_profiles SET is_default=false WHERE team_id=team AND is_default AND id<>chosen;
  UPDATE public.business_profiles SET is_default=true WHERE id=chosen AND team_id=team AND NOT is_default;
  RETURN chosen;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_business_profile(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); team uuid; target_default boolean; target_archived boolean; replacement uuid;
BEGIN
  team := public.current_team();
  IF actor IS NULL OR team IS NULL OR actor <> team OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Bu işlem yalnızca çalışma alanı sahibi tarafından yapılabilir.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(team::text, 0));
  PERFORM 1 FROM public.business_profiles bp WHERE bp.team_id=team ORDER BY bp.id FOR UPDATE;
  SELECT bp.is_default,bp.is_archived INTO target_default,target_archived FROM public.business_profiles bp WHERE bp.id=_profile_id AND bp.team_id=team;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil bulunamadı.'; END IF;
  IF target_archived THEN
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
    RETURN replacement;
  END IF;
  IF target_default THEN
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.id<>_profile_id AND NOT bp.is_archived ORDER BY bp.created_at,bp.id LIMIT 1;
    IF replacement IS NULL THEN RAISE EXCEPTION 'Son etkin profil kaldırılamaz. Önce yeni bir profil oluşturun.'; END IF;
    UPDATE public.business_profiles SET is_default=false WHERE id=_profile_id AND team_id=team;
    UPDATE public.business_profiles SET is_default=true WHERE id=replacement AND team_id=team;
  ELSE
    SELECT bp.id INTO replacement FROM public.business_profiles bp WHERE bp.team_id=team AND bp.is_default AND NOT bp.is_archived LIMIT 1;
  END IF;
  UPDATE public.business_profiles SET is_archived=true WHERE id=_profile_id AND team_id=team;
  RETURN replacement;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_business_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_business_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_business_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_business_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "access scoped work record read" ON public.work_records;
DROP POLICY IF EXISTS "access scoped work record writes" ON public.work_records;
DROP POLICY IF EXISTS "owner operational work record read" ON public.work_records;
DROP POLICY IF EXISTS "owner operational work record writes" ON public.work_records;
CREATE POLICY "owner operational work record read" ON public.work_records FOR SELECT TO authenticated
USING (team_id = public.current_team() AND (
  public.is_team_usta()
  OR (owner_id = auth.uid() AND kind IN ('job','payroll','advance','payment','workplace','settings'))
));
CREATE POLICY "owner operational work record writes" ON public.work_records FOR ALL TO authenticated
USING (team_id = public.current_team() AND (
  public.is_team_usta()
  OR (owner_id = auth.uid() AND kind IN ('job','payroll','advance','payment','workplace','settings'))
))
WITH CHECK (team_id = public.current_team() AND (
  (public.is_team_usta() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = owner_id AND p.team_id = public.current_team()))
  OR (owner_id = auth.uid() AND kind IN ('job','payroll','advance','payment','workplace','settings'))
));

-- Preserve subscription checks on every bank and installment table.
DROP POLICY IF EXISTS "premium owner manages debt records" ON public.debt_records;
DROP POLICY IF EXISTS "usta manages team debt records" ON public.debt_records;
CREATE POLICY "premium owner manages debt records" ON public.debt_records FOR ALL TO authenticated
USING (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid())
WITH CHECK (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid());

DROP POLICY IF EXISTS "premium owner manages debt installments" ON public.debt_installments;
DROP POLICY IF EXISTS "usta manages team debt installments" ON public.debt_installments;
CREATE POLICY "premium owner manages debt installments" ON public.debt_installments FOR ALL TO authenticated
USING (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()))
WITH CHECK (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()));

DROP POLICY IF EXISTS "premium owner manages debt payments" ON public.debt_payments;
DROP POLICY IF EXISTS "usta manages team debt payments" ON public.debt_payments;
CREATE POLICY "premium owner manages debt payments" ON public.debt_payments FOR ALL TO authenticated
USING (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()))
WITH CHECK (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()));

DROP POLICY IF EXISTS "premium owner reads payment promises" ON public.debt_payment_promises;
DROP POLICY IF EXISTS "usta reads own payment promises" ON public.debt_payment_promises;
CREATE POLICY "premium owner reads payment promises" ON public.debt_payment_promises FOR SELECT TO authenticated
USING (public.has_full_access() AND owner_id=auth.uid() AND team_id=public.current_team());

DROP POLICY IF EXISTS "premium owner manages credit card records" ON public.credit_card_records;
DROP POLICY IF EXISTS "usta manages credit card records" ON public.credit_card_records;
CREATE POLICY "premium owner manages credit card records" ON public.credit_card_records FOR ALL TO authenticated
USING (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid())
WITH CHECK (public.has_full_access() AND team_id=public.current_team() AND owner_id=auth.uid());

-- SECURITY DEFINER RPCs can bypass row policies. These triggers keep their
-- writes blocked for free accounts while allowing service-role maintenance.
CREATE OR REPLACE FUNCTION public.require_premium_financial_module()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF session_user IN ('postgres','supabase_admin') OR auth.role() = 'service_role' OR public.has_full_access() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Premium erişim gerekir: banka ve taksit modülleri';
END;
$$;
REVOKE ALL ON FUNCTION public.require_premium_financial_module() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'bank_accounts','bank_transactions','bank_connections','bank_documents',
    'debt_records','debt_installments','debt_payments','debt_payment_promises','credit_card_records'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS require_premium_financial_module ON public.%I', target_table);
    EXECUTE format('CREATE TRIGGER require_premium_financial_module BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.require_premium_financial_module()', target_table);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_catalog()
RETURNS TABLE(plan_code text, amount numeric, currency text, interval_months integer, features text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.plan_code,p.amount,p.currency,p.interval_months,
    CASE p.plan_code
      WHEN 'free' THEN ARRAY[
        'Tüm temel saha ve işletme araçları',
        'İş, müşteri, cari ve randevu yönetimi',
        'Yevmiye, puantaj, ekipman ve bakım takibi',
        'Stok, gider, teklif ve operasyon kayıtları',
        'Raporlama, PDF ve çevrimdışı kayıtlar',
        'Banka ve taksit modülleri hariç tüm bölümler'
      ]::text[]
      ELSE ARRAY[
        'Ücretsiz plandaki tüm özellikler',
        'Banka hesap hareketleri ve banka raporları',
        'Borç, taksit ve kredi kartı ödeme planları',
        'Banka ve taksit PDF raporları',
        'Premium erişim süresince ek finans modülleri'
      ]::text[]
    END
  FROM public.plan_pricing p
  ORDER BY CASE p.plan_code WHEN 'free' THEN 0 WHEN 'premium_monthly' THEN 1 ELSE 2 END;
$$;
REVOKE ALL ON FUNCTION public.get_plan_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_catalog() TO authenticated;

NOTIFY pgrst, 'reload schema';
