-- Track a specific promised payment separately from the installment itself.
-- A promise is fulfilled only by actual recorded payments, never by a UI action.

CREATE TABLE IF NOT EXISTS public.debt_payment_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES public.debt_records(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES public.debt_installments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 999999999.99),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  promised_on date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'cancelled')),
  fulfilled_payment_id uuid REFERENCES public.debt_payments(id) ON DELETE SET NULL,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'fulfilled') = (fulfilled_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS debt_payment_promises_one_open_per_installment_idx
  ON public.debt_payment_promises(installment_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS debt_payment_promises_owner_date_idx
  ON public.debt_payment_promises(owner_id, promised_on, status);

ALTER TABLE public.debt_payment_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payment_promises FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.debt_payment_promises FROM anon, authenticated;
GRANT SELECT ON public.debt_payment_promises TO authenticated;
GRANT ALL ON public.debt_payment_promises TO service_role;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='debt_payment_promises' LOOP
    EXECUTE format('DROP POLICY %I ON public.debt_payment_promises', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "usta reads own payment promises" ON public.debt_payment_promises
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND team_id = (SELECT public.current_team())
    AND (SELECT public.is_team_usta())
  );

CREATE OR REPLACE FUNCTION public.create_debt_payment_promise(
  _debt_id uuid,
  _installment_id uuid,
  _amount numeric,
  _promised_on date,
  _note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  team uuid := public.current_team();
  remaining numeric(12,2);
  promise_id uuid;
BEGIN
  IF actor IS NULL OR team IS NULL OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Ödeme sözü yalnızca çalışma alanı sahibi tarafından eklenebilir.';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _promised_on IS NULL OR _promised_on < CURRENT_DATE THEN
    RAISE EXCEPTION 'Geçerli bir tutar ve bugüne eşit veya daha ileri bir tarih girin.';
  END IF;
  IF char_length(coalesce(_note, '')) > 240 THEN
    RAISE EXCEPTION 'Ödeme sözü notu 240 karakterden uzun olamaz.';
  END IF;

  SELECT (i.amount - i.paid_amount)::numeric(12,2) INTO remaining
  FROM public.debt_installments i
  JOIN public.debt_records d ON d.id = i.debt_id
  WHERE i.id = _installment_id
    AND i.debt_id = _debt_id
    AND i.owner_id = actor
    AND i.team_id = team
    AND d.owner_id = actor
    AND d.team_id = team
  FOR UPDATE OF i;

  IF remaining IS NULL OR remaining <= 0 THEN
    RAISE EXCEPTION 'Açık taksit bulunamadı.';
  END IF;
  IF _amount > remaining THEN
    RAISE EXCEPTION 'Söz verilen tutar taksitin kalan tutarını aşamaz.';
  END IF;

  INSERT INTO public.debt_payment_promises (
    team_id, owner_id, debt_id, installment_id, amount, promised_on, note
  ) VALUES (
    team, actor, _debt_id, _installment_id, _amount, _promised_on, btrim(coalesce(_note, ''))
  ) RETURNING id INTO promise_id;

  RETURN promise_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Bu taksit için zaten açık bir ödeme sözü var.';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_debt_payment_promise(_promise_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  team uuid := public.current_team();
  cancelled_id uuid;
BEGIN
  IF actor IS NULL OR team IS NULL OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Ödeme sözü yalnızca çalışma alanı sahibi tarafından değiştirilebilir.';
  END IF;

  UPDATE public.debt_payment_promises
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = _promise_id
    AND owner_id = actor
    AND team_id = team
    AND status = 'open'
  RETURNING id INTO cancelled_id;

  IF cancelled_id IS NULL THEN
    RAISE EXCEPTION 'Açık ödeme sözü bulunamadı.';
  END IF;
  RETURN cancelled_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_debt_payment_promise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  promise public.debt_payment_promises;
  paid_total numeric(12,2);
BEGIN
  IF NEW.installment_id IS NULL THEN RETURN NEW; END IF;

  FOR promise IN
    SELECT *
    FROM public.debt_payment_promises p
    WHERE p.installment_id = NEW.installment_id
      AND p.status = 'open'
      AND p.created_at <= NEW.created_at
    FOR UPDATE
  LOOP
    SELECT coalesce(sum(dp.amount), 0)::numeric(12,2) INTO paid_total
    FROM public.debt_payments dp
    WHERE dp.installment_id = promise.installment_id
      AND dp.created_at >= promise.created_at;

    UPDATE public.debt_payment_promises
    SET paid_amount = least(promise.amount, paid_total),
        status = CASE WHEN paid_total >= promise.amount THEN 'fulfilled' ELSE 'open' END,
        fulfilled_payment_id = CASE WHEN paid_total >= promise.amount THEN NEW.id ELSE NULL END,
        fulfilled_at = CASE WHEN paid_total >= promise.amount THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = promise.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_debt_payment_promise_after_insert ON public.debt_payments;
CREATE TRIGGER track_debt_payment_promise_after_insert
  AFTER INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.track_debt_payment_promise();

REVOKE ALL ON FUNCTION public.create_debt_payment_promise(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_debt_payment_promise(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.track_debt_payment_promise() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_debt_payment_promise(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_debt_payment_promise(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
