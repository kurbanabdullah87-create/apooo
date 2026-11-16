-- Open-banking connection metadata and private, owner-scoped bank documents.
-- Provider credentials stay outside the database; only opaque provider IDs are stored.

CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_connection_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'needs_reauth', 'error', 'disconnected')),
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider, provider_connection_id)
);

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_kind text NOT NULL DEFAULT 'personal'
    CHECK (account_kind IN ('personal', 'business')),
  ADD COLUMN IF NOT EXISTS provider_account_id text,
  ADD COLUMN IF NOT EXISTS last_balance_synced_at timestamptz;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'unavailable'
    CHECK (receipt_status IN ('available', 'unavailable', 'not_requested'));

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_provider_account_unique
  ON public.bank_accounts (connection_id, provider_account_id)
  WHERE connection_id IS NOT NULL AND provider_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_provider_transaction_unique
  ON public.bank_transactions (account_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_connections_owner_status_idx
  ON public.bank_connections (owner_id, status);

CREATE TABLE IF NOT EXISTS public.bank_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL DEFAULT public.current_team(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bank_receipt', 'saha_receipt', 'monthly_statement')),
  period_month date,
  object_path text NOT NULL,
  original_filename text NOT NULL,
  official boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'monthly_statement' AND period_month IS NOT NULL AND transaction_id IS NULL)
      OR (kind <> 'monthly_statement' AND transaction_id IS NOT NULL AND period_month IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_documents_monthly_unique
  ON public.bank_documents (account_id, period_month, kind);
CREATE UNIQUE INDEX IF NOT EXISTS bank_documents_transaction_kind_unique
  ON public.bank_documents (transaction_id, kind);
CREATE INDEX IF NOT EXISTS bank_documents_owner_account_idx
  ON public.bank_documents (owner_id, account_id, created_at DESC);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_connections, public.bank_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections, public.bank_documents TO authenticated;
GRANT ALL ON public.bank_connections, public.bank_documents TO service_role;

CREATE POLICY "users manage only their bank connections"
  ON public.bank_connections FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND team_id = (SELECT public.current_team()))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND team_id = (SELECT public.current_team()));

CREATE POLICY "users manage only their bank documents"
  ON public.bank_documents FOR ALL TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND team_id = (SELECT public.current_team())
    AND EXISTS (
      SELECT 1 FROM public.bank_accounts a
      WHERE a.id = bank_documents.account_id AND a.owner_id = (SELECT auth.uid())
    )
    AND (transaction_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_transactions t
      WHERE t.id = bank_documents.transaction_id
        AND t.account_id = bank_documents.account_id
        AND t.owner_id = (SELECT auth.uid())
    ))
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND team_id = (SELECT public.current_team())
    AND EXISTS (
      SELECT 1 FROM public.bank_accounts a
      WHERE a.id = bank_documents.account_id AND a.owner_id = (SELECT auth.uid())
    )
    AND (transaction_id IS NULL OR EXISTS (
      SELECT 1 FROM public.bank_transactions t
      WHERE t.id = bank_documents.transaction_id
        AND t.account_id = bank_documents.account_id
        AND t.owner_id = (SELECT auth.uid())
    ))
    AND official = false
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bank-private', 'bank-private', false, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

CREATE POLICY "bank document owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bank document owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bank-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bank document owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bank-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "bank document owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bank-private' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'bank-private' AND (storage.foldername(name))[1] = auth.uid()::text);
