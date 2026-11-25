-- Admin-managed feature availability for free accounts. Premium and administrator
-- entitlements always retain access; this only changes the global free-plan matrix.
BEGIN;

CREATE TABLE IF NOT EXISTS public.free_feature_access (
  feature_key text PRIMARY KEY CHECK (feature_key IN (
    'panel','isler','cari','yevmiye','giderler','ayarlar','banka','taksitler',
    'randevu','ekipman','stok','doviz','rapor','alim','puantaj','hava','hesaplayici'
  )),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.free_feature_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_feature_access FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_feature_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.free_feature_access TO service_role;

INSERT INTO public.free_feature_access(feature_key,enabled) VALUES
 ('panel',true),('isler',true),('cari',true),('yevmiye',true),('giderler',true),('ayarlar',true),
 ('banka',false),('taksitler',false),('randevu',false),('ekipman',false),('stok',false),
 ('doviz',false),('rapor',false),('alim',false),('puantaj',false),('hava',false),('hesaplayici',false)
ON CONFLICT (feature_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_module_access(_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_full_access()
    OR EXISTS (SELECT 1 FROM public.free_feature_access f WHERE f.feature_key=_feature AND f.enabled)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_feature_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(f.feature_key, public.has_module_access(f.feature_key)), '{}'::jsonb)
  FROM public.free_feature_access f;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_free_features()
RETURNS TABLE(feature_key text, enabled boolean, updated_at timestamptz, updated_by_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Bu ayarlar yalnızca yöneticiye açıktır.'; END IF;
  RETURN QUERY SELECT f.feature_key,f.enabled,f.updated_at,u.email::text
    FROM public.free_feature_access f LEFT JOIN auth.users u ON u.id=f.updated_by
    ORDER BY f.feature_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_free_feature(_feature text, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Bu ayar yalnızca yönetici tarafından değiştirilebilir.'; END IF;
  IF _feature NOT IN (
    'panel','isler','cari','yevmiye','giderler','ayarlar','banka','taksitler',
    'randevu','ekipman','stok','doviz','rapor','alim','puantaj','hava','hesaplayici'
  ) THEN RAISE EXCEPTION 'Bilinmeyen özellik.'; END IF;
  INSERT INTO public.free_feature_access(feature_key,enabled,updated_by,updated_at)
    VALUES (_feature,coalesce(_enabled,false),auth.uid(),now())
    ON CONFLICT (feature_key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
END;
$$;

-- Free accounts can use each work-record family only when its feature is enabled.
DROP POLICY IF EXISTS "owner operational work record read" ON public.work_records;
DROP POLICY IF EXISTS "owner operational work record writes" ON public.work_records;
DROP POLICY IF EXISTS "free core work record read" ON public.work_records;
DROP POLICY IF EXISTS "free core work record writes" ON public.work_records;
DROP POLICY IF EXISTS "access scoped work record read" ON public.work_records;
DROP POLICY IF EXISTS "access scoped work record writes" ON public.work_records;
CREATE POLICY "admin feature scoped work record read" ON public.work_records FOR SELECT TO authenticated
USING (team_id=public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta()) OR
  (owner_id=auth.uid() AND public.has_module_access(CASE
    WHEN kind='job' OR kind='job_template' THEN 'isler'
    WHEN kind IN ('payroll','advance','payment') THEN 'yevmiye'
    WHEN kind='equipment' OR kind='maintenance' THEN 'ekipman'
    WHEN kind='exchange_rate' THEN 'doviz'
    WHEN kind='attendance' THEN 'puantaj'
    WHEN kind='stock_movement' THEN 'stok'
    WHEN kind='settings' OR kind='workplace' THEN 'ayarlar'
    WHEN kind='shopping' AND payload->>'_t'='appointment' THEN 'randevu'
    WHEN kind='shopping' AND payload->>'_t' IN ('inventory_item','stock_movement') THEN 'stok'
    WHEN kind='shopping' AND payload->>'_t'='attendance' THEN 'puantaj'
    WHEN kind='shopping' THEN 'alim'
    ELSE 'alim' END))
));
CREATE POLICY "admin feature scoped work record writes" ON public.work_records FOR ALL TO authenticated
USING (team_id=public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta()) OR
  (owner_id=auth.uid() AND public.has_module_access(CASE
    WHEN kind='job' OR kind='job_template' THEN 'isler'
    WHEN kind IN ('payroll','advance','payment') THEN 'yevmiye'
    WHEN kind='equipment' OR kind='maintenance' THEN 'ekipman'
    WHEN kind='exchange_rate' THEN 'doviz'
    WHEN kind='attendance' THEN 'puantaj'
    WHEN kind='stock_movement' THEN 'stok'
    WHEN kind='settings' OR kind='workplace' THEN 'ayarlar'
    WHEN kind='shopping' AND payload->>'_t'='appointment' THEN 'randevu'
    WHEN kind='shopping' AND payload->>'_t' IN ('inventory_item','stock_movement') THEN 'stok'
    WHEN kind='shopping' AND payload->>'_t'='attendance' THEN 'puantaj'
    WHEN kind='shopping' THEN 'alim'
    ELSE 'alim' END))
))
WITH CHECK (team_id=public.current_team() AND (
  (public.has_full_access() AND public.is_team_usta() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=owner_id AND p.team_id=public.current_team())) OR
  (owner_id=auth.uid() AND public.has_module_access(CASE
    WHEN kind='job' OR kind='job_template' THEN 'isler'
    WHEN kind IN ('payroll','advance','payment') THEN 'yevmiye'
    WHEN kind='equipment' OR kind='maintenance' THEN 'ekipman'
    WHEN kind='exchange_rate' THEN 'doviz'
    WHEN kind='attendance' THEN 'puantaj'
    WHEN kind='stock_movement' THEN 'stok'
    WHEN kind='settings' OR kind='workplace' THEN 'ayarlar'
    WHEN kind='shopping' AND payload->>'_t'='appointment' THEN 'randevu'
    WHEN kind='shopping' AND payload->>'_t' IN ('inventory_item','stock_movement') THEN 'stok'
    WHEN kind='shopping' AND payload->>'_t'='attendance' THEN 'puantaj'
    WHEN kind='shopping' THEN 'alim'
    ELSE 'alim' END))
));

DROP POLICY IF EXISTS "plan scoped customers" ON public.customers;
DROP POLICY IF EXISTS "usta team customers" ON public.customers;
CREATE POLICY "plan scoped customers" ON public.customers FOR ALL TO authenticated
USING (team_id=public.current_team() AND public.has_module_access('cari'))
WITH CHECK (team_id=public.current_team() AND public.has_module_access('cari'));
DROP POLICY IF EXISTS "plan scoped transactions" ON public.transactions;
DROP POLICY IF EXISTS "usta team transactions" ON public.transactions;
CREATE POLICY "plan scoped transactions" ON public.transactions FOR ALL TO authenticated
USING (team_id=public.current_team() AND public.has_module_access('cari'))
WITH CHECK (team_id=public.current_team() AND public.has_module_access('cari'));
DROP POLICY IF EXISTS "plan scoped expenses" ON public.expenses;
DROP POLICY IF EXISTS "usta team expenses" ON public.expenses;
CREATE POLICY "plan scoped expenses" ON public.expenses FOR ALL TO authenticated
USING (team_id=public.current_team() AND public.has_module_access('giderler'))
WITH CHECK (team_id=public.current_team() AND public.has_module_access('giderler'));

-- Financial data and SECURITY DEFINER write guards share the same feature rule.
DROP POLICY IF EXISTS "premium owner manages bank accounts" ON public.bank_accounts;
CREATE POLICY "premium owner manages bank accounts" ON public.bank_accounts FOR ALL TO authenticated
USING (public.has_module_access('banka') AND owner_id=auth.uid() AND team_id=public.current_team())
WITH CHECK (public.has_module_access('banka') AND owner_id=auth.uid() AND team_id=public.current_team());
DROP POLICY IF EXISTS "premium owner manages bank movements" ON public.bank_transactions;
CREATE POLICY "premium owner manages bank movements" ON public.bank_transactions FOR ALL TO authenticated
USING (public.has_module_access('banka') AND bank_transactions.owner_id=auth.uid() AND bank_transactions.team_id=public.current_team() AND EXISTS(SELECT 1 FROM public.bank_accounts a WHERE a.id=bank_transactions.account_id AND a.owner_id=auth.uid()))
WITH CHECK (public.has_module_access('banka') AND bank_transactions.owner_id=auth.uid() AND bank_transactions.team_id=public.current_team() AND EXISTS(SELECT 1 FROM public.bank_accounts a WHERE a.id=bank_transactions.account_id AND a.owner_id=auth.uid()));
DROP POLICY IF EXISTS "premium owner manages bank connections" ON public.bank_connections;
CREATE POLICY "premium owner manages bank connections" ON public.bank_connections FOR ALL TO authenticated
USING (public.has_module_access('banka') AND owner_id=auth.uid() AND team_id=public.current_team())
WITH CHECK (public.has_module_access('banka') AND owner_id=auth.uid() AND team_id=public.current_team());
DROP POLICY IF EXISTS "premium owner manages bank documents" ON public.bank_documents;
CREATE POLICY "premium owner manages bank documents" ON public.bank_documents FOR ALL TO authenticated
USING (public.has_module_access('banka') AND bank_documents.owner_id=auth.uid() AND bank_documents.team_id=public.current_team() AND EXISTS(SELECT 1 FROM public.bank_accounts a WHERE a.id=bank_documents.account_id AND a.owner_id=auth.uid()) AND (bank_documents.transaction_id IS NULL OR EXISTS(SELECT 1 FROM public.bank_transactions t WHERE t.id=bank_documents.transaction_id AND t.account_id=bank_documents.account_id AND t.owner_id=auth.uid())))
WITH CHECK (public.has_module_access('banka') AND bank_documents.owner_id=auth.uid() AND bank_documents.team_id=public.current_team() AND EXISTS(SELECT 1 FROM public.bank_accounts a WHERE a.id=bank_documents.account_id AND a.owner_id=auth.uid()) AND (bank_documents.transaction_id IS NULL OR EXISTS(SELECT 1 FROM public.bank_transactions t WHERE t.id=bank_documents.transaction_id AND t.account_id=bank_documents.account_id AND t.owner_id=auth.uid())) AND bank_documents.official=false);

DROP POLICY IF EXISTS "premium owner manages debt records" ON public.debt_records;
DROP POLICY IF EXISTS "usta manages team debt records" ON public.debt_records;
CREATE POLICY "premium owner manages debt records" ON public.debt_records FOR ALL TO authenticated
USING (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid())
WITH CHECK (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid());
DROP POLICY IF EXISTS "premium owner manages debt installments" ON public.debt_installments;
DROP POLICY IF EXISTS "usta manages team debt installments" ON public.debt_installments;
CREATE POLICY "premium owner manages debt installments" ON public.debt_installments FOR ALL TO authenticated
USING (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()))
WITH CHECK (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()));
DROP POLICY IF EXISTS "premium owner manages debt payments" ON public.debt_payments;
DROP POLICY IF EXISTS "usta manages team debt payments" ON public.debt_payments;
CREATE POLICY "premium owner manages debt payments" ON public.debt_payments FOR ALL TO authenticated
USING (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()))
WITH CHECK (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid() AND EXISTS(SELECT 1 FROM public.debt_records d WHERE d.id=debt_id AND d.owner_id=auth.uid() AND d.team_id=public.current_team()));
DROP POLICY IF EXISTS "premium owner reads payment promises" ON public.debt_payment_promises;
DROP POLICY IF EXISTS "usta reads own payment promises" ON public.debt_payment_promises;
CREATE POLICY "premium owner reads payment promises" ON public.debt_payment_promises FOR SELECT TO authenticated
USING (public.has_module_access('taksitler') AND owner_id=auth.uid() AND team_id=public.current_team());
DROP POLICY IF EXISTS "premium owner manages credit card records" ON public.credit_card_records;
DROP POLICY IF EXISTS "usta manages credit card records" ON public.credit_card_records;
CREATE POLICY "premium owner manages credit card records" ON public.credit_card_records FOR ALL TO authenticated
USING (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid())
WITH CHECK (public.has_module_access('taksitler') AND team_id=public.current_team() AND owner_id=auth.uid());

CREATE OR REPLACE FUNCTION public.require_premium_financial_module()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE feature text;
BEGIN
  feature := CASE WHEN TG_TABLE_NAME IN ('bank_accounts','bank_transactions','bank_connections','bank_documents') THEN 'banka' ELSE 'taksitler' END;
  IF session_user IN ('postgres','supabase_admin') OR auth.role()='service_role' OR public.has_module_access(feature) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Bu modül için erişim yetkisi yok.';
END;
$$;

-- Table triggers also guard writes made through SECURITY DEFINER RPCs that
-- intentionally bypass row-level security policies.
CREATE OR REPLACE FUNCTION public.require_enabled_module_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE feature text;
BEGIN
  IF session_user IN ('postgres','supabase_admin') OR auth.role()='service_role' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  feature := CASE TG_TABLE_NAME
    WHEN 'customers' THEN 'cari'
    WHEN 'transactions' THEN 'cari'
    WHEN 'expenses' THEN 'giderler'
    WHEN 'debt_records' THEN 'taksitler'
    WHEN 'debt_installments' THEN 'taksitler'
    WHEN 'debt_payments' THEN 'taksitler'
    WHEN 'debt_payment_promises' THEN 'taksitler'
    WHEN 'credit_card_records' THEN 'taksitler'
    ELSE NULL END;
  IF feature IS NULL OR public.has_module_access(feature) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Bu ücretsiz plan özelliği şu anda yönetici tarafından kapalı.' USING ERRCODE='42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.require_enabled_work_record_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE row_kind text; row_payload jsonb; feature text;
BEGIN
  IF session_user IN ('postgres','supabase_admin') OR auth.role()='service_role' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN row_kind:=OLD.kind; row_payload:=OLD.payload;
  ELSE row_kind:=NEW.kind; row_payload:=NEW.payload; END IF;
  feature := CASE
    WHEN row_kind IN ('job','job_template') THEN 'isler'
    WHEN row_kind IN ('payroll','advance','payment') THEN 'yevmiye'
    WHEN row_kind IN ('equipment','maintenance') THEN 'ekipman'
    WHEN row_kind='exchange_rate' THEN 'doviz'
    WHEN row_kind='attendance' OR (row_kind='shopping' AND row_payload->>'_t'='attendance') THEN 'puantaj'
    WHEN row_kind='stock_movement' OR (row_kind='shopping' AND row_payload->>'_t' IN ('inventory_item','stock_movement')) THEN 'stok'
    WHEN row_kind IN ('settings','workplace') THEN 'ayarlar'
    WHEN row_kind='appointment' OR (row_kind='shopping' AND row_payload->>'_t'='appointment') THEN 'randevu'
    WHEN row_kind='shopping' THEN 'alim'
    ELSE 'alim' END;
  IF public.has_module_access(feature) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Bu ücretsiz plan özelliği şu anda yönetici tarafından kapalı.' USING ERRCODE='42501';
END;
$$;

DROP TRIGGER IF EXISTS require_enabled_work_record_write ON public.work_records;
CREATE TRIGGER require_enabled_work_record_write BEFORE INSERT OR UPDATE OR DELETE ON public.work_records
FOR EACH ROW EXECUTE FUNCTION public.require_enabled_work_record_write();

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'customers','transactions','expenses','debt_records','debt_installments',
    'debt_payments','debt_payment_promises','credit_card_records'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS require_enabled_module_write ON public.%I', target_table);
    EXECUTE format('CREATE TRIGGER require_enabled_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.require_enabled_module_write()', target_table);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "premium bank document upload" ON storage.objects;
DROP POLICY IF EXISTS "premium bank document read" ON storage.objects;
DROP POLICY IF EXISTS "premium bank document delete" ON storage.objects;
DROP POLICY IF EXISTS "premium bank document update" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner upload" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner read" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner delete" ON storage.objects;
DROP POLICY IF EXISTS "bank document owner update" ON storage.objects;
CREATE POLICY "premium bank document upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_module_access('banka'));
CREATE POLICY "premium bank document read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_module_access('banka'));
CREATE POLICY "premium bank document delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_module_access('banka'));
CREATE POLICY "premium bank document update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_module_access('banka'))
WITH CHECK (bucket_id='bank-private' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_module_access('banka'));

GRANT EXECUTE ON FUNCTION public.has_module_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_feature_access() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_free_features() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_free_feature(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_free_features() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_free_feature(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_current_feature_access() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.has_module_access(text) FROM PUBLIC,anon;
NOTIFY pgrst,'reload schema';
COMMIT;
