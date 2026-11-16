ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  ADD COLUMN IF NOT EXISTS payment_due_days integer NOT NULL DEFAULT 15 CHECK (payment_due_days BETWEEN 0 AND 3650),
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_photo_url text,
  ADD COLUMN IF NOT EXISTS job_record_id uuid REFERENCES public.work_records(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_financial_job_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked public.work_records;
BEGIN
  IF TG_TABLE_NAME='expenses' THEN
    IF NEW.job_record_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO linked FROM public.work_records WHERE id=NEW.job_record_id AND team_id=NEW.team_id AND kind='job';
  ELSIF TG_TABLE_NAME='work_records' THEN
    IF NEW.kind<>'payroll' OR nullif(trim(coalesce(NEW.payload->>'job_id','')),'') IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO linked FROM public.work_records WHERE id=public.try_uuid(NEW.payload->>'job_id') AND team_id=NEW.team_id AND kind='job';
  END IF;
  IF linked.id IS NULL THEN RAISE EXCEPTION 'Bağlı iş kaydı aynı ekipte bulunamadı'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.validate_financial_job_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_expense_job_link ON public.expenses;
CREATE TRIGGER validate_expense_job_link BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.validate_financial_job_link();
DROP TRIGGER IF EXISTS validate_payroll_job_link ON public.work_records;
CREATE TRIGGER validate_payroll_job_link BEFORE INSERT OR UPDATE ON public.work_records FOR EACH ROW EXECUTE FUNCTION public.validate_financial_job_link();

CREATE OR REPLACE FUNCTION public.customer_credit_status(_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; balance numeric; overdue numeric;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id=_customer_id AND team_id=public.current_team();
  IF c.id IS NULL THEN RAISE EXCEPTION 'Müşteri bulunamadı'; END IF;
  SELECT coalesce(sum(CASE WHEN kind='debt' THEN amount ELSE -amount END),0) INTO balance
    FROM public.transactions WHERE customer_id=c.id AND team_id=c.team_id;
  WITH debts AS (
    SELECT id, amount, occurred_on,
      coalesce(sum(amount) OVER (ORDER BY occurred_on,created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_debt
    FROM public.transactions WHERE customer_id=c.id AND team_id=c.team_id AND kind='debt'
  ), paid AS (
    SELECT coalesce(sum(amount),0) AS total FROM public.transactions WHERE customer_id=c.id AND team_id=c.team_id AND kind='payment'
  )
  SELECT coalesce(sum(greatest(0,d.amount-greatest(0,p.total-d.prior_debt))),0) INTO overdue
  FROM debts d CROSS JOIN paid p WHERE d.occurred_on + c.payment_due_days < current_date;
  RETURN jsonb_build_object('balance',balance,'credit_limit',c.credit_limit,'overdue',overdue,
    'is_blocked',c.is_blocked,'restricted',c.is_blocked OR balance>c.credit_limit OR overdue>0);
END; $$;
REVOKE ALL ON FUNCTION public.customer_credit_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_credit_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_customer_credit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE customer_id uuid; guard jsonb; reason text;
BEGIN
  IF NEW.kind NOT IN ('job','shopping') OR (NEW.kind='shopping' AND NEW.payload->>'_t' IS DISTINCT FROM 'appointment') THEN RETURN NEW; END IF;
  -- Existing jobs still need to be editable/completable after the customer reaches the limit.
  -- Re-check only when creating the obligation or changing the appointment's customer.
  IF TG_OP='UPDATE' AND NEW.payload->>'customer_id' IS NOT DISTINCT FROM OLD.payload->>'customer_id' THEN RETURN NEW; END IF;
  customer_id:=public.try_uuid(NEW.payload->>'customer_id');
  IF customer_id IS NULL THEN RETURN NEW; END IF;
  SELECT public.customer_credit_status(customer_id) INTO guard;
  reason:=nullif(trim(coalesce(NEW.payload->>'override_reason','')),'');
  IF coalesce((guard->>'restricted')::boolean,false) AND reason IS NULL THEN
    RAISE EXCEPTION 'Müşteri cari kısıtlı: güncel bakiye %, limit %, vadesi geçmiş %. Yönetici gerekçesi girin veya tahsilat alın.',
      guard->>'balance',guard->>'credit_limit',guard->>'overdue';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enforce_customer_credit_guard ON public.work_records;
CREATE TRIGGER enforce_customer_credit_guard BEFORE INSERT OR UPDATE ON public.work_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_credit_guard();

CREATE OR REPLACE FUNCTION public.bump_machine_seconds(_eq uuid, _team uuid, _delta numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n int;
BEGIN
 IF _delta=0 THEN RETURN; END IF;
 PERFORM set_config('saha.machine_sync','1',true);
 UPDATE public.work_records SET payload=payload||jsonb_build_object(
   'job_seconds',greatest(0,coalesce((payload->>'job_seconds')::numeric,0)+_delta),
   'maintenance_blocked',
     (coalesce(nullif(payload->>'maintenance_hours','')::numeric,0)>0 AND greatest(0,(coalesce((payload->>'seconds')::numeric,0)+coalesce((payload->>'job_seconds')::numeric,0)+_delta-coalesce((payload->>'last_service_seconds')::numeric,0))/3600)
       > coalesce(nullif(payload->>'maintenance_hours','')::numeric,0)+5
 ),'total_work_hours',greatest(0,(coalesce((payload->>'seconds')::numeric,0)+coalesce((payload->>'job_seconds')::numeric,0)+_delta)/3600)
 ),updated_at=now()
 WHERE id=_eq AND team_id=_team AND kind='equipment';
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM set_config('saha.machine_sync','0',true);
 IF n=0 AND _delta>0 THEN RAISE EXCEPTION 'Makine bulunamadı'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bump_machine_seconds(uuid,uuid,numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_machine_counters() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.kind<>'equipment' OR coalesce(current_setting('saha.machine_sync',true),'')='1' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  NEW.payload:=(NEW.payload-'last_service_on')||jsonb_build_object('job_seconds',0,'last_service_seconds',0,'total_work_hours',0,'maintenance_blocked',false);
 ELSE
  NEW.payload:=NEW.payload||jsonb_build_object('job_seconds',coalesce(OLD.payload->'job_seconds','0'::jsonb),'last_service_seconds',coalesce(OLD.payload->'last_service_seconds','0'::jsonb),'total_work_hours',coalesce(OLD.payload->'total_work_hours','0'::jsonb),'maintenance_blocked',coalesce(OLD.payload->'maintenance_blocked','false'::jsonb));
  IF OLD.payload->'last_service_on' IS NOT NULL THEN NEW.payload:=NEW.payload||jsonb_build_object('last_service_on',OLD.payload->'last_service_on'); ELSE NEW.payload:=NEW.payload-'last_service_on'; END IF;
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.service_equipment(_equipment_id uuid, _note text DEFAULT NULL, _cost numeric DEFAULT 0) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.work_records; total numeric; today text:=to_char(now() AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD');
BEGIN
 IF NOT public.is_team_usta() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
 IF coalesce(_cost,0)<0 THEN RAISE EXCEPTION 'Bakım maliyeti negatif olamaz'; END IF;
 SELECT * INTO e FROM public.work_records WHERE id=_equipment_id AND team_id=public.current_team() AND kind='equipment' FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Ekipman bulunamadı'; END IF;
 total:=coalesce((e.payload->>'seconds')::numeric,0)+coalesce((e.payload->>'job_seconds')::numeric,0);
 IF e.payload->>'started_at' IS NOT NULL THEN total:=total+greatest(0,extract(epoch FROM now()-(e.payload->>'started_at')::timestamptz)); END IF;
 PERFORM set_config('saha.machine_sync','1',true);
 UPDATE public.work_records SET payload=payload||jsonb_build_object('last_service_seconds',total,'last_service_on',today,'maintenance_blocked',false,'total_work_hours',total/3600),updated_at=now() WHERE id=e.id;
 PERFORM set_config('saha.machine_sync','0',true);
 INSERT INTO public.work_records(team_id,owner_id,kind,payload) VALUES(e.team_id,auth.uid(),'maintenance',
  jsonb_build_object('equipment_id',e.id,'date',today,'cost',coalesce(_cost,0),'notes',coalesce(nullif(trim(_note),''),'Periyodik bakım'),'service_seconds',total));
 RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.service_equipment(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_equipment(uuid,text,numeric) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_job_equipment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eq public.work_records; reason text; total_hours numeric; last_hours numeric; interval_hours numeric;
BEGIN
 IF NEW.kind<>'job' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.payload->>'equipment_id' IS NOT DISTINCT FROM OLD.payload->>'equipment_id' THEN RETURN NEW; END IF;
 SELECT * INTO eq FROM public.work_records WHERE id=public.try_uuid(NEW.payload->>'equipment_id') AND team_id=NEW.team_id AND kind='equipment';
 IF eq.id IS NULL THEN RETURN NEW; END IF;
 total_hours:=(coalesce((eq.payload->>'seconds')::numeric,0)+coalesce((eq.payload->>'job_seconds')::numeric,0))/3600;
 last_hours:=coalesce((eq.payload->>'last_service_seconds')::numeric,0)/3600;
 interval_hours:=coalesce(nullif(eq.payload->>'maintenance_hours','')::numeric,0);
 reason:=nullif(trim(coalesce(NEW.payload->>'override_reason','')),'');
 IF ((eq.payload->>'maintenance_blocked')::boolean IS TRUE OR (interval_hours>0 AND total_hours-last_hours>interval_hours+5)) AND reason IS NULL THEN
   RAISE EXCEPTION 'Ekipman bakıma alınmalı. Bakım kaydı girin veya gerekçeli yönetici istisnası yazın.';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_job_equipment ON public.work_records;
CREATE TRIGGER guard_job_equipment BEFORE INSERT OR UPDATE ON public.work_records FOR EACH ROW EXECUTE FUNCTION public.guard_job_equipment();

CREATE OR REPLACE FUNCTION public.complete_appointment(_appointment_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.work_records; job_id uuid; transaction_id uuid; customer_id uuid;
BEGIN
  IF NOT public.is_team_usta() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO a FROM public.work_records WHERE id=_appointment_id AND team_id=public.current_team()
    AND kind='shopping' AND payload->>'_t'='appointment' FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Randevu bulunamadı'; END IF;
  IF a.payload->>'status'='İptal' THEN RAISE EXCEPTION 'İptal edilmiş randevu tamamlanamaz'; END IF;
  customer_id:=public.try_uuid(a.payload->>'customer_id');
  IF customer_id IS NULL THEN RAISE EXCEPTION 'Randevuyu önce kayıtlı bir müşteriyle eşleştirin'; END IF;
  SELECT w.id INTO job_id FROM public.work_records w WHERE w.team_id=a.team_id AND w.kind='job' AND w.payload->>'appointment_id'=a.id::text ORDER BY w.created_at DESC LIMIT 1;
  IF job_id IS NOT NULL THEN
    transaction_id:=public.bill_job(job_id);
    UPDATE public.work_records SET payload=payload||jsonb_build_object('status','Tamamlandı','job_id',job_id,'completed_at',now()),updated_at=now() WHERE id=a.id;
    RETURN transaction_id;
  END IF;
  IF coalesce((a.payload->>'price')::numeric,0)<=0 THEN RAISE EXCEPTION 'Önce randevuya iş tutarı girin'; END IF;
  IF nullif(trim(coalesce(a.payload->>'job_id','')),'') IS NOT NULL THEN
    job_id:=public.try_uuid(a.payload->>'job_id');
    SELECT t.id INTO transaction_id FROM public.transactions t WHERE t.job_record_id=job_id LIMIT 1;
    IF transaction_id IS NOT NULL THEN RETURN transaction_id; END IF;
    IF job_id IS NOT NULL THEN
      transaction_id:=public.bill_job(job_id);
      UPDATE public.work_records SET payload=payload||jsonb_build_object('status','Tamamlandı','completed_at',now()),updated_at=now() WHERE id=a.id;
      RETURN transaction_id;
    END IF;
  END IF;
  INSERT INTO public.work_records(team_id,owner_id,kind,payload) VALUES(a.team_id,auth.uid(),'job',jsonb_build_object(
    'title',coalesce(nullif(trim(a.payload->>'title'),''),a.payload->>'name','Randevu işi'), 'customer_id',customer_id,
    'owner_id',auth.uid(),'date',to_char(now() AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD'), 'status','Tamamlandı',
    'seconds',0,'no_machine',true,'equipment_id',null,'price',(a.payload->>'price')::numeric,
    'material_cost',coalesce((a.payload->>'material_cost')::numeric,0),'vat_rate',coalesce((a.payload->>'vat_rate')::smallint,0),
    'notes',coalesce(a.payload->>'notes',''),'appointment_id',a.id,'override_reason',coalesce(a.payload->>'override_reason',''),
    'completed_at',now()
  )) RETURNING id INTO job_id;
  transaction_id:=public.bill_job(job_id);
  UPDATE public.work_records SET payload=payload||jsonb_build_object('status','Tamamlandı','job_id',job_id,'completed_at',now()),updated_at=now() WHERE id=a.id;
  RETURN transaction_id;
END; $$;
REVOKE ALL ON FUNCTION public.complete_appointment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid) TO authenticated;
