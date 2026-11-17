-- Inventory quantities are kept in team-scoped work_records; all changes go through an atomic RPC.
-- Attendance is stored as a special shopping record so existing payroll validation remains untouched.

DROP POLICY IF EXISTS "team master or own apprentice read" ON public.work_records;
CREATE POLICY "team master or own apprentice read" ON public.work_records FOR SELECT TO authenticated
  USING (
    team_id=public.current_team()
    AND (
      public.is_team_usta()
      OR (owner_id=auth.uid() AND kind IN ('job','payroll','advance','payment'))
      OR (owner_id=auth.uid() AND kind='shopping' AND payload->>'_t'='attendance')
    )
  );

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  _item_id uuid,
  _operation text,
  _quantity numeric,
  _notes text DEFAULT '',
  _job_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  item public.work_records;
  job public.work_records;
  delta numeric;
  next_quantity numeric;
  movement_id uuid;
BEGIN
  IF NOT public.is_team_usta() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF _operation NOT IN ('purchase','use','return') THEN RAISE EXCEPTION 'Geçersiz stok hareketi'; END IF;
  IF _quantity IS NULL OR _quantity<=0 OR _quantity>100000000 THEN RAISE EXCEPTION 'Miktar sıfırdan büyük olmalı'; END IF;

  SELECT * INTO item FROM public.work_records
    WHERE id=_item_id AND team_id=public.current_team() AND kind='shopping' AND payload->>'_t'='inventory_item'
    FOR UPDATE;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Stok kalemi bulunamadı'; END IF;
  IF _job_id IS NOT NULL THEN
    SELECT * INTO job FROM public.work_records WHERE id=_job_id AND team_id=item.team_id AND kind='job';
    IF job.id IS NULL THEN RAISE EXCEPTION 'İş emri bu ekipte bulunamadı'; END IF;
  END IF;

  delta:=CASE WHEN _operation='use' THEN -_quantity ELSE _quantity END;
  next_quantity:=coalesce(nullif(item.payload->>'quantity','')::numeric,0)+delta;
  IF next_quantity<0 THEN RAISE EXCEPTION 'Yetersiz stok. Mevcut miktar: %',coalesce(nullif(item.payload->>'quantity','')::numeric,0); END IF;

  UPDATE public.work_records SET payload=payload||jsonb_build_object('quantity',next_quantity),updated_at=now() WHERE id=item.id;
  INSERT INTO public.work_records(team_id,owner_id,kind,payload)
    VALUES(item.team_id,auth.uid(),'shopping',jsonb_strip_nulls(jsonb_build_object(
      '_t','stock_movement','item_id',item.id,'item_name',item.payload->>'name','operation',_operation,
      'quantity',_quantity,'balance_after',next_quantity,'job_id',_job_id,
      'date',to_char(now() AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD'),
      'notes',nullif(left(trim(coalesce(_notes,'')),500),''))))
    RETURNING id INTO movement_id;
  RETURN jsonb_build_object('movement_id',movement_id,'item_id',item.id,'quantity',next_quantity);
END;
$$;
REVOKE ALL ON FUNCTION public.record_stock_movement(uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid,text,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_attendance(_lat numeric DEFAULT NULL,_lng numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  team uuid;
  active_row public.work_records;
  result_id uuid;
  stamp timestamptz:=now();
  local_day text:=to_char(now() AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum gerekli'; END IF;
  team:=public.current_team();
  IF team IS NULL THEN RAISE EXCEPTION 'Ekip bilgisi bulunamadı'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));

  SELECT * INTO active_row FROM public.work_records
    WHERE team_id=team AND owner_id=auth.uid() AND kind='shopping' AND payload->>'_t'='attendance'
      AND nullif(payload->>'clock_out_at','') IS NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF active_row.id IS NOT NULL THEN
    UPDATE public.work_records SET payload=payload||jsonb_strip_nulls(jsonb_build_object(
      'clock_out_at',stamp,'clock_out_lat',_lat,'clock_out_lng',_lng,'status','closed')),
      updated_at=stamp WHERE id=active_row.id RETURNING id INTO result_id;
    RETURN jsonb_build_object('operation','clock_out','id',result_id,'timestamp',stamp);
  END IF;

  INSERT INTO public.work_records(team_id,owner_id,kind,payload)
    VALUES(team,auth.uid(),'shopping',jsonb_strip_nulls(jsonb_build_object(
      '_t','attendance','date',local_day,'clock_in_at',stamp,'clock_in_lat',_lat,'clock_in_lng',_lng,'status','open')))
    RETURNING id INTO result_id;
  RETURN jsonb_build_object('operation','clock_in','id',result_id,'timestamp',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_attendance(numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.toggle_attendance(numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_job_checklist() RETURNS trigger
LANGUAGE plpgsql SET search_path=''
AS $$
DECLARE tasks jsonb;
BEGIN
  IF NEW.kind<>'job' OR coalesce((NEW.payload->>'checklist_required')::boolean,false) IS NOT TRUE
    OR (NEW.payload->>'status' IS DISTINCT FROM 'Tamamlandı' AND coalesce((NEW.payload->>'billed')::boolean,false) IS NOT TRUE) THEN
    RETURN NEW;
  END IF;
  BEGIN
    tasks:=coalesce(nullif(NEW.payload->>'checklist_json','')::jsonb,'[]'::jsonb);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'İş kontrol listesi biçimi geçersiz';
  END;
  IF jsonb_typeof(tasks)<>'array' OR jsonb_array_length(tasks)=0
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(tasks) AS elements(element) WHERE coalesce(elements.element->>'done','false')<>'true') THEN
    RAISE EXCEPTION 'İş kapatılamaz: zorunlu kontrol listesindeki tüm adımları tamamlayın';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_job_checklist ON public.work_records;
CREATE TRIGGER enforce_job_checklist BEFORE INSERT OR UPDATE ON public.work_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_job_checklist();
