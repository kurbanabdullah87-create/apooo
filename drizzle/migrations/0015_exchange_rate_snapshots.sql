-- Market-rate history is not financial-account data. A user can read and append
-- only their own snapshots; the existing master-only operational write policy
-- remains unchanged for every other work_record kind.
ALTER TABLE public.work_records DROP CONSTRAINT IF EXISTS work_records_kind_check;
ALTER TABLE public.work_records ADD CONSTRAINT work_records_kind_check
  CHECK (kind IN ('job','payroll','advance','payment','workplace','equipment','maintenance','shopping','job_template','settings','exchange_rate'));

DROP POLICY IF EXISTS "own exchange-rate snapshot read" ON public.work_records;
CREATE POLICY "own exchange-rate snapshot read" ON public.work_records
  FOR SELECT TO authenticated
  USING (team_id=public.current_team() AND owner_id=auth.uid() AND kind='exchange_rate');

DROP POLICY IF EXISTS "own exchange-rate snapshot insert" ON public.work_records;
CREATE POLICY "own exchange-rate snapshot insert" ON public.work_records
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id=public.current_team()
    AND owner_id=auth.uid()
    AND kind='exchange_rate'
    AND coalesce(payload->>'usd','') ~ '^[0-9]+(\.[0-9]+)?$'
    AND coalesce(payload->>'eur','') ~ '^[0-9]+(\.[0-9]+)?$'
    AND coalesce(payload->>'gbp','') ~ '^[0-9]+(\.[0-9]+)?$'
    AND coalesce(payload->>'source','')='mid-market'
  );
