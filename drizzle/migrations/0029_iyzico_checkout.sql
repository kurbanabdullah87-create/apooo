-- Hosted iyzico checkout orders. Card data is never stored by Saha.
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL CHECK (plan_code IN ('premium_monthly','premium_annual')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','review')),
  provider text NOT NULL DEFAULT 'iyzico' CHECK (provider = 'iyzico'),
  provider_conversation_id text NOT NULL UNIQUE,
  provider_token text UNIQUE,
  provider_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON public.payment_orders(user_id, created_at DESC);
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_orders FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_orders FROM authenticated;
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
DROP POLICY IF EXISTS "users read own payment orders" ON public.payment_orders;
CREATE POLICY "users read own payment orders" ON public.payment_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.complete_iyzico_plan_order(
  _order_id uuid, _payment_id text, _verified_amount numeric, _verified_currency text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ord public.payment_orders%ROWTYPE; current_expiry timestamptz; new_start timestamptz; months integer;
BEGIN
  IF coalesce(_payment_id,'') = '' OR _verified_currency <> 'TRY' THEN
    RAISE EXCEPTION 'Invalid verified payment.';
  END IF;
  SELECT * INTO ord FROM public.payment_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found.'; END IF;
  IF ord.status = 'paid' THEN RETURN; END IF;
  IF ord.status NOT IN ('pending','review')
    OR round(ord.amount,2) <> round(_verified_amount,2)
    OR ord.currency <> _verified_currency THEN
    RAISE EXCEPTION 'Payment order verification failed.';
  END IF;
  SELECT interval_months INTO months FROM public.plan_pricing WHERE plan_code = ord.plan_code;
  IF months NOT IN (1,12) THEN RAISE EXCEPTION 'Invalid plan term.'; END IF;
  SELECT expires_at INTO current_expiry FROM public.plan_entitlements
    WHERE user_id = ord.user_id AND status = 'active' AND expires_at > now() FOR UPDATE;
  new_start := greatest(now(), coalesce(current_expiry, now()));
  INSERT INTO public.plan_entitlements(user_id,plan_code,status,starts_at,expires_at,provider,provider_reference,updated_at)
    VALUES(ord.user_id,ord.plan_code,'active',new_start,new_start + make_interval(months => months),'iyzico',_payment_id,now())
  ON CONFLICT (user_id) DO UPDATE SET plan_code=excluded.plan_code,status='active',
    starts_at=excluded.starts_at,expires_at=excluded.expires_at,provider='iyzico',
    provider_reference=excluded.provider_reference,updated_at=now();
  UPDATE public.payment_orders SET status='paid',provider_payment_id=_payment_id,paid_at=now(),updated_at=now()
    WHERE id = _order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_iyzico_plan_order(uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_iyzico_plan_order(uuid,text,numeric,text) TO service_role;

NOTIFY pgrst, 'reload schema';
