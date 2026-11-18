-- Dedicated credit-card directory and financed purchase plans.
CREATE TABLE public.credit_card_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  record_kind text NOT NULL CHECK (record_kind IN ('card', 'purchase')),
  card_id uuid REFERENCES public.credit_card_records(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((record_kind = 'card' AND card_id IS NULL) OR (record_kind = 'purchase' AND card_id IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.validate_credit_card_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_card public.credit_card_records;
BEGIN
  IF NEW.record_kind = 'purchase' THEN
    SELECT * INTO parent_card FROM public.credit_card_records
      WHERE id = NEW.card_id AND record_kind = 'card' AND owner_id = NEW.owner_id AND team_id = NEW.team_id;
    IF parent_card.id IS NULL THEN RAISE EXCEPTION 'Kredi kartı aynı hesaba ait değil'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_credit_card_record() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_credit_card_record BEFORE INSERT OR UPDATE ON public.credit_card_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_card_record();

ALTER TABLE public.credit_card_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_card_records FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_records TO authenticated;
GRANT ALL ON public.credit_card_records TO service_role;
CREATE POLICY "usta manages credit card records" ON public.credit_card_records FOR ALL TO authenticated
  USING (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta()))
  WITH CHECK (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta()));
CREATE INDEX credit_card_records_owner_kind_idx ON public.credit_card_records(owner_id, record_kind, created_at DESC);
CREATE INDEX credit_card_records_card_idx ON public.credit_card_records(card_id) WHERE card_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
