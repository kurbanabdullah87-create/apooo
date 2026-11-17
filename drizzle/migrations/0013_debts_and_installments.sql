-- Private, master-managed receivables and payment plans.
CREATE TABLE public.debt_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('receivable', 'payable')),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text NOT NULL DEFAULT '',
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0 AND total_amount <= 999999999.99),
  acquired_on date NOT NULL DEFAULT current_date,
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count BETWEEN 1 AND 360),
  interval_months integer NOT NULL DEFAULT 1 CHECK (interval_months BETWEEN 1 AND 12),
  first_due_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.debt_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.debt_records(id) ON DELETE CASCADE,
  installment_no integer NOT NULL CHECK (installment_no > 0),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_on date NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  paid_at date,
  UNIQUE (debt_id, installment_no)
);

CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.debt_records(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.debt_installments(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.debt_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_installments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.debt_records, public.debt_installments, public.debt_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_records, public.debt_installments, public.debt_payments TO authenticated;
GRANT ALL ON public.debt_records, public.debt_installments, public.debt_payments TO service_role;

CREATE POLICY "usta manages team debt records" ON public.debt_records FOR ALL TO authenticated
  USING (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta()))
  WITH CHECK (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta()));
CREATE POLICY "usta manages team debt installments" ON public.debt_installments FOR ALL TO authenticated
  USING (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta())
    AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id = debt_id AND d.owner_id = (SELECT auth.uid()) AND d.team_id = (SELECT public.current_team())))
  WITH CHECK (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta())
    AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id = debt_id AND d.owner_id = (SELECT auth.uid()) AND d.team_id = (SELECT public.current_team())));
CREATE POLICY "usta manages team debt payments" ON public.debt_payments FOR ALL TO authenticated
  USING (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta())
    AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id = debt_id AND d.owner_id = (SELECT auth.uid()) AND d.team_id = (SELECT public.current_team())))
  WITH CHECK (team_id = (SELECT public.current_team()) AND owner_id = (SELECT auth.uid()) AND (SELECT public.is_team_usta())
    AND EXISTS (SELECT 1 FROM public.debt_records d WHERE d.id = debt_id AND d.owner_id = (SELECT auth.uid()) AND d.team_id = (SELECT public.current_team())));

CREATE INDEX debt_records_owner_direction_idx ON public.debt_records(owner_id, direction, created_at DESC);
CREATE INDEX debt_installments_owner_due_idx ON public.debt_installments(owner_id, due_on);
CREATE INDEX debt_payments_debt_paid_idx ON public.debt_payments(debt_id, paid_on DESC);

CREATE OR REPLACE FUNCTION public.record_debt_payment(_debt_id uuid, _installment_id uuid, _amount numeric, _paid_on date, _note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE i public.debt_installments; payment_id uuid;
BEGIN
  IF NOT public.is_team_usta() OR _amount <= 0 THEN RAISE EXCEPTION 'Geçersiz ödeme'; END IF;
  SELECT * INTO i FROM public.debt_installments
    WHERE id = _installment_id AND debt_id = _debt_id AND owner_id = auth.uid() AND team_id = public.current_team()
    FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Taksit bulunamadı'; END IF;
  IF i.paid_amount + _amount > i.amount THEN RAISE EXCEPTION 'Ödeme kalan taksit tutarını aşamaz'; END IF;
  INSERT INTO public.debt_payments(team_id, owner_id, debt_id, installment_id, amount, paid_on, note)
  VALUES (i.team_id, i.owner_id, _debt_id, _installment_id, _amount, _paid_on, coalesce(_note, '')) RETURNING id INTO payment_id;
  UPDATE public.debt_installments SET paid_amount = paid_amount + _amount,
    paid_at = CASE WHEN paid_amount + _amount >= amount THEN _paid_on ELSE NULL END WHERE id = i.id;
  RETURN payment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, text) TO authenticated;
