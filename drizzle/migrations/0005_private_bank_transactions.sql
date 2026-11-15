-- Bank movements are private to an authenticated user, even inside a shared team.
-- These records are entered by the user; this does not connect to a bank.

-- Keep local migrations usable while extending the pre-existing production tables.
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name text NOT NULL DEFAULT 'Elle kayıt',
  account_name text NOT NULL DEFAULT 'Kişisel hesap',
  iban text NOT NULL DEFAULT '',
  account_no text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'vadesiz',
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TL',
  color text DEFAULT '#1e40af',
  credit_limit numeric,
  interest_rate numeric,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  description text NOT NULL DEFAULT '',
  counterparty text NOT NULL DEFAULT '',
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 99999999.99),
  type text NOT NULL DEFAULT 'diger',
  direction text NOT NULL DEFAULT 'out',
  balance_after numeric NOT NULL DEFAULT 0,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed',
  source text NOT NULL DEFAULT 'manual',
  source_ref uuid,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS counterparty text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_amount_check'
      AND conrelid = 'public.bank_transactions'::regclass
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_amount_check CHECK (amount > 0 AND amount <= 99999999.99);
  END IF;
END $$;

-- Older rows were team-owned. Preserve them under the team owner's identity.
UPDATE public.bank_accounts SET owner_id = team_id WHERE owner_id IS NULL;
UPDATE public.bank_transactions bt
SET owner_id = COALESCE(ba.owner_id, bt.team_id)
FROM public.bank_accounts ba
WHERE ba.id = bt.account_id AND bt.owner_id IS NULL;
UPDATE public.bank_transactions SET owner_id = team_id WHERE owner_id IS NULL;

ALTER TABLE public.bank_accounts ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.bank_accounts ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.bank_transactions ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.bank_transactions ALTER COLUMN owner_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_accounts_owner_id_fkey'
      AND conrelid = 'public.bank_accounts'::regclass
  ) THEN
    ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_owner_id_fkey'
      AND conrelid = 'public.bank_transactions'::regclass
  ) THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_accounts, public.bank_transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts, public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_accounts, public.bank_transactions TO service_role;

DROP POLICY IF EXISTS "usta bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "usta bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "users manage only their bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "users manage only their bank movements" ON public.bank_transactions;

CREATE POLICY "users manage only their bank accounts"
  ON public.bank_accounts FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND team_id = (SELECT public.current_team()))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND team_id = (SELECT public.current_team()));

CREATE POLICY "users manage only their bank movements"
  ON public.bank_transactions FOR ALL TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND team_id = (SELECT public.current_team())
    AND EXISTS (
      SELECT 1 FROM public.bank_accounts a
      WHERE a.id = bank_transactions.account_id
        AND a.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND team_id = (SELECT public.current_team())
    AND EXISTS (
      SELECT 1 FROM public.bank_accounts a
      WHERE a.id = bank_transactions.account_id
        AND a.owner_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS bank_accounts_owner_idx ON public.bank_accounts (owner_id);
CREATE INDEX IF NOT EXISTS bank_transactions_owner_date_idx
  ON public.bank_transactions (owner_id, date DESC, created_at DESC);
