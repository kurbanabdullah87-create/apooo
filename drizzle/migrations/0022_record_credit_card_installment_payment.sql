-- Apply card installment payments atomically so concurrent updates cannot
-- overwrite one another's schedule or payment history.
CREATE OR REPLACE FUNCTION public.record_credit_card_installment_payment(
  _purchase_id uuid,
  _installment_no integer,
  _amount numeric,
  _paid_on date,
  _method text DEFAULT 'Banka havalesi',
  _account text DEFAULT '',
  _reference text DEFAULT '',
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
  purchase public.credit_card_records;
  installment jsonb;
  installment_ordinal bigint;
  installment_total numeric(12,2);
  paid_before numeric(12,2);
  paid_after numeric(12,2);
  amount numeric(12,2) := round(_amount, 2);
  new_schedule jsonb;
  old_payments jsonb;
  payment_id uuid := gen_random_uuid();
  payment_entry jsonb;
BEGIN
  IF actor IS NULL OR team IS NULL OR NOT public.is_team_usta() THEN
    RAISE EXCEPTION 'Kart taksit ödemesi yalnızca çalışma alanı sahibi tarafından kaydedilebilir.';
  END IF;
  IF _installment_no IS NULL OR _installment_no < 1 OR amount IS NULL OR amount <= 0 OR _paid_on IS NULL THEN
    RAISE EXCEPTION 'Geçerli taksit, tutar ve ödeme tarihi girin.';
  END IF;
  IF _method IS NULL OR _method NOT IN ('Banka havalesi', 'Karttan otomatik ödeme', 'Nakit', 'Başka hesap') THEN
    RAISE EXCEPTION 'Geçerli ödeme kanalı seçin.';
  END IF;
  IF char_length(coalesce(_account, '')) > 160
    OR char_length(coalesce(_reference, '')) > 160
    OR char_length(coalesce(_note, '')) > 500 THEN
    RAISE EXCEPTION 'Hesap, referans veya not alanı izin verilen uzunluğu aşıyor.';
  END IF;

  SELECT * INTO purchase
  FROM public.credit_card_records
  WHERE id = _purchase_id
    AND record_kind = 'purchase'
    AND owner_id = actor
    AND team_id = team
  FOR UPDATE;
  IF purchase.id IS NULL THEN
    RAISE EXCEPTION 'Kart taksit planı bulunamadı.';
  END IF;
  IF coalesce(jsonb_typeof(purchase.payload->'schedule'), '') <> 'array' THEN
    RAISE EXCEPTION 'Taksit planının ödeme çizelgesi geçersiz.';
  END IF;
  old_payments := coalesce(purchase.payload->'payments', '[]'::jsonb);
  IF coalesce(jsonb_typeof(old_payments), '') <> 'array' THEN
    RAISE EXCEPTION 'Ödeme geçmişi geçersiz.';
  END IF;

  SELECT entry, ordinal::bigint
  INTO installment, installment_ordinal
  FROM jsonb_array_elements(purchase.payload->'schedule') WITH ORDINALITY AS schedule(entry, ordinal)
  WHERE entry->>'no' = _installment_no::text;
  IF installment IS NULL THEN
    RAISE EXCEPTION 'İstenen taksit bu planda bulunamadı.';
  END IF;

  installment_total := round((installment->>'total')::numeric, 2);
  paid_before := round(coalesce((installment->>'paid')::numeric, 0), 2);
  IF installment_total <= 0 OR paid_before < 0 OR paid_before > installment_total THEN
    RAISE EXCEPTION 'Taksit tutarı veya önceki ödeme kaydı geçersiz.';
  END IF;
  IF amount > round(installment_total - paid_before, 2) THEN
    RAISE EXCEPTION 'Ödeme kalan taksit tutarını aşamaz.';
  END IF;
  paid_after := round(paid_before + amount, 2);

  SELECT coalesce(
    jsonb_agg(
      CASE WHEN ordinal = installment_ordinal THEN
        jsonb_set(
          jsonb_set(entry, '{paid}', to_jsonb(paid_after)),
          '{paid_on}',
          CASE WHEN paid_after >= installment_total THEN to_jsonb(_paid_on::text) ELSE 'null'::jsonb END
        )
      ELSE entry END
      ORDER BY ordinal
    ),
    '[]'::jsonb
  ) INTO new_schedule
  FROM jsonb_array_elements(purchase.payload->'schedule') WITH ORDINALITY AS schedule(entry, ordinal);

  payment_entry := jsonb_build_object(
    'id', payment_id,
    'installment_no', _installment_no,
    'amount', amount,
    'paid_on', _paid_on,
    'method', _method,
    'account', btrim(coalesce(_account, '')),
    'reference', btrim(coalesce(_reference, '')),
    'note', btrim(coalesce(_note, ''))
  );

  UPDATE public.credit_card_records
  SET payload = jsonb_set(
    jsonb_set(purchase.payload, '{schedule}', new_schedule),
    '{payments}', jsonb_build_array(payment_entry) || old_payments
  ), updated_at = now()
  WHERE id = purchase.id AND owner_id = actor AND team_id = team;

  RETURN payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_credit_card_installment_payment(uuid, integer, numeric, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_credit_card_installment_payment(uuid, integer, numeric, date, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
