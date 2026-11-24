-- Link an optional receipt / bank reference directly to its recorded payment.
ALTER TABLE public.debt_payments
  ADD COLUMN receipt_no text NOT NULL DEFAULT ''
  CHECK (char_length(receipt_no) <= 80);

CREATE UNIQUE INDEX debt_payments_owner_receipt_no_unique_idx
  ON public.debt_payments(owner_id, upper(btrim(receipt_no)))
  WHERE btrim(receipt_no) <> '';

CREATE OR REPLACE FUNCTION public.record_debt_payment_with_receipt(
  _debt_id uuid,
  _installment_id uuid,
  _amount numeric,
  _paid_on date,
  _note text DEFAULT '',
  _receipt_no text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  installment public.debt_installments;
  payment_id uuid;
  receipt text := btrim(coalesce(_receipt_no, ''));
BEGIN
  IF NOT public.is_team_usta() OR _amount IS NULL OR _amount <= 0 OR _paid_on IS NULL THEN
    RAISE EXCEPTION 'Geçerli ödeme bilgileri girin.';
  END IF;
  IF char_length(receipt) > 80 THEN
    RAISE EXCEPTION 'Makbuz / işlem numarası 80 karakterden uzun olamaz.';
  END IF;

  SELECT * INTO installment
  FROM public.debt_installments
  WHERE id = _installment_id
    AND debt_id = _debt_id
    AND owner_id = auth.uid()
    AND team_id = public.current_team()
  FOR UPDATE;

  IF installment.id IS NULL THEN
    RAISE EXCEPTION 'Taksit bulunamadı.';
  END IF;
  IF installment.paid_amount + _amount > installment.amount THEN
    RAISE EXCEPTION 'Ödeme kalan taksit tutarını aşamaz.';
  END IF;

  INSERT INTO public.debt_payments (
    team_id, owner_id, debt_id, installment_id, amount, paid_on, note, receipt_no
  ) VALUES (
    installment.team_id, installment.owner_id, _debt_id, _installment_id,
    _amount, _paid_on, coalesce(_note, ''), receipt
  ) RETURNING id INTO payment_id;

  UPDATE public.debt_installments
  SET paid_amount = paid_amount + _amount,
      paid_at = CASE WHEN paid_amount + _amount >= amount THEN _paid_on ELSE NULL END
  WHERE id = installment.id;

  RETURN payment_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Bu makbuz / işlem numarası daha önce kullanılmış.';
END;
$$;

REVOKE ALL ON FUNCTION public.record_debt_payment_with_receipt(uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debt_payment_with_receipt(uuid, uuid, numeric, date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
