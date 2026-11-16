-- Workplaces are saved as team work records; payroll/advance/payment remain master managed.
ALTER TABLE public.work_records DROP CONSTRAINT IF EXISTS work_records_kind_check;
ALTER TABLE public.work_records ADD CONSTRAINT work_records_kind_check
  CHECK (kind IN ('job','payroll','advance','payment','workplace','equipment','maintenance','shopping','job_template','settings'));

CREATE OR REPLACE FUNCTION public.validate_work_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE days numeric; rate numeric; multiplier numeric; overtime_hours numeric;
BEGIN
  IF NEW.kind='payroll' THEN
    days:=coalesce((NEW.payload->>'days')::numeric,0);
    rate:=coalesce((NEW.payload->>'rate')::numeric,-1);
    multiplier:=coalesce((NEW.payload->>'multiplier')::numeric,1);
    overtime_hours:=coalesce((NEW.payload->>'overtime_hours')::numeric,0);
    IF days NOT IN (0,0.25,0.5,1,1.5,2) OR rate<0 OR multiplier NOT IN (1,1.5,2)
      OR overtime_hours<0 OR coalesce((NEW.payload->>'overtime_multiplier')::numeric,1.5) NOT IN (1,1.5,2) THEN
      RAISE EXCEPTION 'Geçersiz yevmiye';
    END IF;
    IF days=0 AND coalesce(NEW.payload->>'status','')<>'İzinli' THEN RAISE EXCEPTION 'İzin günü durumu seçilmelidir'; END IF;
  END IF;
  IF NEW.kind='advance' AND coalesce((NEW.payload->>'amount')::numeric,0)<=0 THEN RAISE EXCEPTION 'Geçersiz avans'; END IF;
  IF NEW.kind='payment' AND coalesce((NEW.payload->>'amount')::numeric,0)<=0 THEN RAISE EXCEPTION 'Geçersiz ödeme'; END IF;
  IF NEW.kind='workplace' AND coalesce(nullif(trim(NEW.payload->>'name'),''),'')='' THEN RAISE EXCEPTION 'İşyeri adı gerekli'; END IF;
  NEW.updated_at:=now(); RETURN NEW;
END; $$;

-- Team members can see their own payment history; masters keep the existing team-wide read access.
DROP POLICY IF EXISTS "team master or own apprentice read" ON public.work_records;
CREATE POLICY "team master or own apprentice read" ON public.work_records FOR SELECT TO authenticated
  USING(team_id=public.current_team() AND (public.is_team_usta() OR (owner_id=auth.uid() AND kind IN ('job','payroll','advance','payment'))));
