-- Manual bank-transfer checkout. No national ID or card data is collected.
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bank_name text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  iban text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(bank_name) <= 80 AND length(account_name) <= 100 AND length(iban) <= 34 AND length(instructions) <= 500)
);
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.bank_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL CHECK (plan_code IN ('premium_monthly','premium_annual')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency='TRY'),
  status text NOT NULL DEFAULT 'awaiting_transfer' CHECK (status IN ('awaiting_transfer','pending_review','approved','rejected','cancelled')),
  transfer_reference text NOT NULL UNIQUE,
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note) <= 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS bank_transfer_requests_user_date_idx ON public.bank_transfer_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transfer_requests_review_idx ON public.bank_transfer_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transfer_one_open_per_user_idx ON public.bank_transfer_requests(user_id)
  WHERE status IN ('awaiting_transfer','pending_review');
ALTER TABLE public.bank_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfer_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_transfer_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bank_transfer_requests TO service_role;

CREATE OR REPLACE FUNCTION public.is_valid_turkish_iban(_iban text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE normalized text := upper(regexp_replace(_iban, '\s', '', 'g')); rearranged text; remainder integer := 0; idx integer; current_char text; letter_value integer;
BEGIN
  IF normalized !~ '^TR[0-9]{24}$' OR substring(normalized from 10 for 1) <> '0' THEN RETURN false; END IF;
  rearranged := substring(normalized from 5) || substring(normalized from 1 for 4);
  FOR idx IN 1..char_length(rearranged) LOOP
    current_char := substring(rearranged from idx for 1);
    IF current_char ~ '^[0-9]$' THEN
      remainder := (remainder * 10 + current_char::integer) % 97;
    ELSE
      letter_value := pg_catalog.ascii(current_char) - pg_catalog.ascii('A') + 10;
      remainder := (remainder * 10 + letter_value / 10) % 97;
      remainder := (remainder * 10 + pg_catalog.mod(letter_value, 10)) % 97;
    END IF;
  END LOOP;
  RETURN remainder = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.is_valid_turkish_iban(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_instructions()
RETURNS TABLE(bank_name text, account_name text, iban text, instructions text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.bank_name, s.account_name, s.iban, s.instructions FROM public.payment_settings s WHERE s.id=true AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.set_payment_instructions(_bank_name text, _account_name text, _iban text, _instructions text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized_iban text := upper(regexp_replace(coalesce(_iban,''), '\s', '', 'g'));
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF length(coalesce(_bank_name,'')) > 80 OR length(coalesce(_account_name,'')) > 100 OR length(coalesce(_instructions,'')) > 500 THEN RAISE EXCEPTION 'Alan sınırı aşıldı.'; END IF;
  IF normalized_iban <> '' AND NOT public.is_valid_turkish_iban(normalized_iban) THEN RAISE EXCEPTION 'Türkiye IBAN bilgisi geçerli görünmüyor; rakamları kontrol edin.'; END IF;
  INSERT INTO public.payment_settings(id, bank_name, account_name, iban, instructions, updated_at)
  VALUES(true, btrim(coalesce(_bank_name,'')), btrim(coalesce(_account_name,'')), normalized_iban, btrim(coalesce(_instructions,'')), now())
  ON CONFLICT(id) DO UPDATE SET bank_name=excluded.bank_name, account_name=excluded.account_name, iban=excluded.iban, instructions=excluded.instructions, updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.start_bank_transfer(_plan_code text)
RETURNS TABLE(request_id uuid, amount numeric, currency text, transfer_reference text, bank_name text, account_name text, iban text, instructions text, plan_code text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); selected_amount numeric; selected_currency text; discount integer := 0; existing public.bank_transfer_requests; settings public.payment_settings;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Oturum gerekli.'; END IF;
  IF public.has_full_access() THEN RAISE EXCEPTION 'Hesabında Premium erişim zaten etkin.'; END IF;
  IF _plan_code NOT IN ('premium_monthly','premium_annual') THEN RAISE EXCEPTION 'Geçersiz plan.'; END IF;
  SELECT * INTO settings FROM public.payment_settings WHERE id=true;
  IF settings.iban IS NULL OR settings.iban = '' THEN RAISE EXCEPTION 'Ödeme IBAN bilgisi henüz tanımlanmadı.'; END IF;
  SELECT p.amount, p.currency INTO selected_amount, selected_currency FROM public.plan_pricing p WHERE p.plan_code=_plan_code;
  IF selected_amount IS NULL OR selected_amount <= 0 OR selected_currency <> 'TRY' THEN RAISE EXCEPTION 'Plan fiyatı kullanılamıyor.'; END IF;
  SELECT coalesce(max(c.discount_percent),0) INTO discount FROM public.plan_campaigns c
    WHERE c.enabled AND c.starts_at <= now() AND c.ends_at > now() AND c.applies_to IN ('all',_plan_code);
  selected_amount := round(selected_amount * (100-discount) / 100, 2);
  UPDATE public.bank_transfer_requests SET status='cancelled'
    WHERE user_id=actor AND status='awaiting_transfer' AND created_at < now()-interval '24 hours';
  SELECT * INTO existing FROM public.bank_transfer_requests r
    WHERE r.user_id=actor AND r.status IN ('awaiting_transfer','pending_review') ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
  IF existing.id IS NOT NULL THEN
    RETURN QUERY SELECT existing.id, existing.amount, existing.currency, existing.transfer_reference, settings.bank_name, settings.account_name, settings.iban, settings.instructions, existing.plan_code, existing.status;
    RETURN;
  END IF;
  INSERT INTO public.bank_transfer_requests(user_id,plan_code,amount,currency,transfer_reference)
  VALUES(actor,_plan_code,selected_amount,selected_currency,'SAHA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
  RETURNING * INTO existing;
  RETURN QUERY SELECT existing.id, existing.amount, existing.currency, existing.transfer_reference, settings.bank_name, settings.account_name, settings.iban, settings.instructions, existing.plan_code, existing.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_bank_transfer(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum gerekli.'; END IF;
  UPDATE public.bank_transfer_requests SET status='pending_review', submitted_at=now()
    WHERE id=_request_id AND user_id=auth.uid() AND status='awaiting_transfer';
  IF NOT FOUND THEN RAISE EXCEPTION 'Aktarılabilir ödeme talebi bulunamadı.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_bank_transfers()
RETURNS TABLE(id uuid,plan_code text,amount numeric,currency text,status text,transfer_reference text,created_at timestamptz,submitted_at timestamptz,review_note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.id,r.plan_code,r.amount,r.currency,r.status,r.transfer_reference,r.created_at,r.submitted_at,r.review_note
  FROM public.bank_transfer_requests r WHERE r.user_id=auth.uid() ORDER BY r.created_at DESC LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_bank_transfers()
RETURNS TABLE(id uuid,email text,plan_code text,amount numeric,currency text,status text,transfer_reference text,created_at timestamptz,submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY SELECT r.id, lower(u.email), r.plan_code,r.amount,r.currency,r.status,r.transfer_reference,r.created_at,r.submitted_at
    FROM public.bank_transfer_requests r JOIN auth.users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending_review' THEN 0 WHEN 'awaiting_transfer' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_bank_transfer(_request_id uuid, _approve boolean, _review_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request public.bank_transfer_requests; actor uuid := auth.uid(); months integer;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF length(coalesce(_review_note,'')) > 240 THEN RAISE EXCEPTION 'Not 240 karakterden uzun olamaz.'; END IF;
  SELECT * INTO request FROM public.bank_transfer_requests WHERE id=_request_id FOR UPDATE;
  IF request.id IS NULL OR request.status <> 'pending_review' THEN RAISE EXCEPTION 'İncelenecek havale bildirimi bulunamadı.'; END IF;
  IF _approve THEN
    SELECT interval_months INTO months FROM public.plan_pricing WHERE plan_code=request.plan_code;
    IF months NOT IN (1,12) THEN RAISE EXCEPTION 'Plan süresi geçersiz.'; END IF;
    INSERT INTO public.plan_entitlements(user_id,plan_code,status,starts_at,expires_at,provider,provider_reference,updated_at)
    VALUES(request.user_id,request.plan_code,'active',now(),now()+make_interval(months=>months),'manual_bank_transfer',request.id::text,now())
    ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,status='active',starts_at=now(),
      expires_at=greatest(public.plan_entitlements.expires_at,now())+make_interval(months=>months),provider='manual_bank_transfer',provider_reference=request.id::text,updated_at=now();
  END IF;
  UPDATE public.bank_transfer_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    review_note=btrim(coalesce(_review_note,'')),reviewed_at=now(),reviewed_by=actor WHERE id=_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_instructions() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_payment_instructions(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.start_bank_transfer(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_bank_transfer(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_my_bank_transfers() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_list_bank_transfers() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_bank_transfer(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_payment_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payment_instructions(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_bank_transfer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bank_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_bank_transfers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bank_transfers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_bank_transfer(uuid,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
