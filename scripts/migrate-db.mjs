import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.LOVABLE_DB_MIGRATION_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!databaseUrl) {
  console.log("[db:migrate] No direct database URL configured; skipping migrations for this local build.");
  process.exit(0);
}

const client = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  onnotice: () => {},
});

async function tableExists(tx, name) {
  const [{ exists }] = await tx`SELECT to_regclass(${`public.${name}`}) IS NOT NULL AS exists`;
  return exists;
}

async function applyMigration(tx, file, label) {
  const sql = await readFile(resolve(root, "drizzle/migrations", file), "utf8");
  await tx.unsafe(sql).simple();
  console.log(`[db:migrate] Applied ${label}.`);
}

try {
  await client.begin(async (tx) => {
    const debtTables = await Promise.all([
      tableExists(tx, "debt_records"),
      tableExists(tx, "debt_installments"),
      tableExists(tx, "debt_payments"),
    ]);

    if (debtTables.every(Boolean)) {
      console.log("[db:migrate] Debt and receivable tables already exist.");
    } else if (debtTables.some(Boolean)) {
      throw new Error("Debt migration is partially present; refusing to modify production data automatically.");
    } else {
      await applyMigration(tx, "0013_debts_and_installments.sql", "0013_debts_and_installments");
    }

    if (await tableExists(tx, "credit_card_records")) {
      console.log("[db:migrate] Credit-card installment table already exists.");
    } else {
      await applyMigration(tx, "0014_credit_card_installments.sql", "0014_credit_card_installments");
    }

    const [{ definition: workKindDefinition }] = await tx`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid='public.work_records'::regclass AND conname='work_records_kind_check'
    `;
    const ratePolicies = await tx`
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='work_records'
        AND policyname IN ('own exchange-rate snapshot read','own exchange-rate snapshot insert')
    `;
    if (!String(workKindDefinition ?? "").includes("exchange_rate") || ratePolicies.length !== 2) {
      await applyMigration(tx, "0015_exchange_rate_snapshots.sql", "0015_exchange_rate_snapshots");
    } else {
      console.log("[db:migrate] Exchange-rate snapshots are already secured.");
    }

    if (!(await tableExists(tx, "business_profiles"))) {
      await applyMigration(tx, "0016_business_profiles.sql", "0016_business_profiles");
    } else {
      const profileColumns = await tx`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND (
          (table_name='business_profiles' AND column_name IN ('id','team_id','name','is_default','is_archived','created_by')) OR
          (table_name IN ('work_records','transactions','expenses') AND column_name='profile_id')
        )
      `;
      const expectedProfileColumns = [
        'business_profiles:id','business_profiles:team_id','business_profiles:name',
        'business_profiles:is_default','business_profiles:is_archived','business_profiles:created_by',
        'work_records:profile_id','transactions:profile_id','expenses:profile_id',
      ];
      const found = new Set(profileColumns.map((row) => `${row.table_name}:${row.column_name}`));
      const absent = expectedProfileColumns.filter((column) => !found.has(column));
      if (absent.length) throw new Error(`Business profile migration is partially present; missing ${absent.join(', ')}. Refusing an automatic production repair.`);
      const policies = await tx`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='business_profiles'`;
      const triggers = await tx`SELECT tgname FROM pg_trigger WHERE tgrelid IN ('public.work_records'::regclass,'public.transactions'::regclass,'public.expenses'::regclass) AND NOT tgisinternal AND tgname LIKE 'assign_profile_%'`;
      const profileTriggers = await tx`SELECT tgname FROM pg_trigger WHERE tgrelid='public.business_profiles'::regclass AND NOT tgisinternal AND tgname IN ('audit_business_profile','protect_default_business_profile','touch_business_profile_updated_at')`;
      if (policies.length < 3 || triggers.length !== 3 || profileTriggers.length !== 3 || !(await tableExists(tx, 'business_profile_audit'))) throw new Error('Business profile schema is present but its access policies, audit table or validation triggers are incomplete. Refusing to continue.');
      console.log('[db:migrate] Business profile schema and ownership safeguards already exist.');
    }

    const [{ unassignedProfiles }] = await tx`
      SELECT
        (SELECT count(*) FROM public.work_records WHERE kind <> 'settings' AND profile_id IS NULL) +
        (SELECT count(*) FROM public.transactions WHERE profile_id IS NULL) +
        (SELECT count(*) FROM public.expenses WHERE profile_id IS NULL) AS "unassignedProfiles"
    `;
    if (Number(unassignedProfiles) > 0) {
      await applyMigration(tx, "0017_backfill_business_profile_defaults.sql", "0017_backfill_business_profile_defaults");
    }

    const [{ profileLifecycleReady }] = await tx`
      SELECT to_regprocedure('public.set_default_business_profile(uuid)') IS NOT NULL
        AND to_regprocedure('public.archive_business_profile(uuid)') IS NOT NULL AS "profileLifecycleReady"
    `;
    if (!profileLifecycleReady) {
      await applyMigration(tx, "0018_manage_default_business_profiles.sql", "0018_manage_default_business_profiles");
    }

    const [{ promiseTableExists }] = await tx`
      SELECT to_regclass('public.debt_payment_promises') IS NOT NULL AS "promiseTableExists"
    `;
    let appliedDebtPromiseMigration = false;
    if (!promiseTableExists) {
      await applyMigration(tx, "0019_debt_payment_promises.sql", "0019_debt_payment_promises");
      appliedDebtPromiseMigration = true;
    }

    const [{ debtPromiseReady }] = await tx`
      SELECT
        to_regprocedure('public.create_debt_payment_promise(uuid,uuid,numeric,date,text)') IS NOT NULL
        AND to_regprocedure('public.cancel_debt_payment_promise(uuid)') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_class
          WHERE oid=to_regclass('public.debt_payment_promises')
            AND relrowsecurity AND relforcerowsecurity
        )
        AND EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='debt_payment_promises'
            AND policyname='usta reads own payment promises' AND cmd='SELECT'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname='public' AND tablename='debt_payment_promises'
            AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
        )
        AND has_table_privilege('authenticated', 'public.debt_payment_promises', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.debt_payment_promises', 'INSERT')
        AND NOT has_table_privilege('authenticated', 'public.debt_payment_promises', 'UPDATE')
        AND NOT has_table_privilege('authenticated', 'public.debt_payment_promises', 'DELETE')
        AND EXISTS (
          SELECT 1 FROM pg_proc
          WHERE oid=to_regprocedure('public.create_debt_payment_promise(uuid,uuid,numeric,date,text)') AND prosecdef
        )
        AND EXISTS (
          SELECT 1 FROM pg_proc
          WHERE oid=to_regprocedure('public.cancel_debt_payment_promise(uuid)') AND prosecdef
        )
        AND EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid='public.debt_payments'::regclass
            AND tgname='track_debt_payment_promise_after_insert'
            AND NOT tgisinternal
        ) AS "debtPromiseReady"
    `;
    if (!debtPromiseReady) {
      if (appliedDebtPromiseMigration) throw new Error("Debt payment-promise migration verification failed after apply.");
      throw new Error("Debt payment-promise schema is partially present or its access controls are incomplete; refusing an automatic production repair.");
    } else {
      console.log("[db:migrate] Debt payment promises are already secured.");
    }

    const [{ receiptColumnExists, receiptIndexExists, receiptFunctionExists }] = await tx`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid='public.debt_payments'::regclass
            AND attname='receipt_no' AND NOT attisdropped
        ) AS "receiptColumnExists",
        to_regclass('public.debt_payments_owner_receipt_no_unique_idx') IS NOT NULL AS "receiptIndexExists",
        to_regprocedure('public.record_debt_payment_with_receipt(uuid,uuid,numeric,date,text,text)') IS NOT NULL AS "receiptFunctionExists"
    `;
    if (receiptColumnExists && receiptIndexExists && receiptFunctionExists) {
      console.log("[db:migrate] Debt payment receipt references are already secured.");
    } else {
      if (receiptColumnExists || receiptIndexExists || receiptFunctionExists) {
        throw new Error("Debt payment receipt migration is partially present; refusing an automatic production repair.");
      }
      await applyMigration(tx, "0020_debt_payment_receipts.sql", "0020_debt_payment_receipts");
    }

    const [{ rateSnapshotFunctionExists }] = await tx`
      SELECT to_regprocedure('public.save_exchange_rate_snapshot(uuid,numeric,numeric,numeric,text)') IS NOT NULL AS "rateSnapshotFunctionExists"
    `;
    let appliedRateSnapshotMigration = false;
    if (!rateSnapshotFunctionExists) {
      await applyMigration(tx, "0021_secure_exchange_rate_snapshots.sql", "0021_secure_exchange_rate_snapshots");
      appliedRateSnapshotMigration = true;
    }
    const [{ rateSnapshotFunctionReady }] = await tx`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid=to_regprocedure('public.save_exchange_rate_snapshot(uuid,numeric,numeric,numeric,text)')
          AND prosecdef
          AND proconfig @> ARRAY['search_path=""']::text[]
      )
      AND has_function_privilege('authenticated', 'public.save_exchange_rate_snapshot(uuid,numeric,numeric,numeric,text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.save_exchange_rate_snapshot(uuid,numeric,numeric,numeric,text)', 'EXECUTE')
      AS "rateSnapshotFunctionReady"
    `;
    if (!rateSnapshotFunctionReady) {
      if (appliedRateSnapshotMigration) throw new Error("Exchange-rate snapshot RPC verification failed after apply.");
      throw new Error("Exchange-rate snapshot RPC exists but its security settings are incomplete; refusing automatic repair.");
    }
    console.log("[db:migrate] Exchange-rate snapshot RPC is secured.");

    const [{ cardPaymentFunctionExists }] = await tx`
      SELECT to_regprocedure('public.record_credit_card_installment_payment(uuid,integer,numeric,date,text,text,text,text)') IS NOT NULL AS "cardPaymentFunctionExists"
    `;
    let appliedCardPaymentMigration = false;
    if (!cardPaymentFunctionExists) {
      await applyMigration(tx, "0022_record_credit_card_installment_payment.sql", "0022_record_credit_card_installment_payment");
      appliedCardPaymentMigration = true;
    }
    const [{ cardPaymentFunctionReady }] = await tx`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid=to_regprocedure('public.record_credit_card_installment_payment(uuid,integer,numeric,date,text,text,text,text)')
          AND prosecdef
          AND proconfig @> ARRAY['search_path=""']::text[]
      )
      AND has_function_privilege('authenticated', 'public.record_credit_card_installment_payment(uuid,integer,numeric,date,text,text,text,text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.record_credit_card_installment_payment(uuid,integer,numeric,date,text,text,text,text)', 'EXECUTE')
      AS "cardPaymentFunctionReady"
    `;
    if (!cardPaymentFunctionReady) {
      if (appliedCardPaymentMigration) throw new Error("Credit-card payment RPC verification failed after apply.");
      throw new Error("Credit-card payment RPC exists but its security settings are incomplete; refusing automatic repair.");
    }
    console.log("[db:migrate] Credit-card payment RPC is secured.");

    const [{ accessSchemaReady }] = await tx`
      SELECT to_regclass('public.authorized_emails') IS NOT NULL
        AND to_regclass('public.plan_entitlements') IS NOT NULL
        AND to_regprocedure('public.get_current_access()') IS NOT NULL
        AND to_regprocedure('public.set_authorized_email(text,boolean)') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_records' AND policyname='access scoped work record writes')
        AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bank_accounts' AND policyname='premium owner manages bank accounts')
        AND has_function_privilege('authenticated', 'public.get_current_access()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.get_current_access()', 'EXECUTE')
        AS "accessSchemaReady"
    `;
    if (!accessSchemaReady) {
      await applyMigration(tx, "0023_user_access_and_premium.sql", "0023_user_access_and_premium");
    } else {
      console.log("[db:migrate] Account access and premium entitlement schema are already secured.");
    }

    const [{ profileTriggerNeedsRepair }] = await tx`
      SELECT NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid=to_regprocedure('public.assign_and_validate_business_profile()')
          AND prosrc LIKE '%IF TG_TABLE_NAME = ''transactions'' THEN%'
          AND prosrc NOT LIKE '%TG_TABLE_NAME = ''transactions'' AND NEW.job_record_id%'
      ) AS "profileTriggerNeedsRepair"
    `;
    if (profileTriggerNeedsRepair) {
      await applyMigration(tx, "0024_fix_profile_trigger_job_record_id.sql", "0024_fix_profile_trigger_job_record_id");
    } else {
      console.log("[db:migrate] Business-profile trigger safely branches by table.");
    }

    const [{ planSchemaReady }] = await tx`
      SELECT to_regclass('public.plan_pricing') IS NOT NULL
        AND to_regclass('public.plan_campaigns') IS NOT NULL
        AND to_regprocedure('public.get_plan_catalog()') IS NOT NULL
        AND to_regprocedure('public.list_plan_campaigns()') IS NOT NULL
        AND to_regprocedure('public.save_plan_campaign(uuid,text,text,integer,text,timestamptz,timestamptz,boolean)') IS NOT NULL
        AS "planSchemaReady"
    `;
    if (!planSchemaReady) {
      await applyMigration(tx, "0025_plan_pricing_and_campaigns.sql", "0025_plan_pricing_and_campaigns");
    } else {
      console.log("[db:migrate] Plan pricing and admin campaigns are already secured.");
    }

    const [{ usageSchemaReady }] = await tx`
      SELECT to_regclass('public.app_usage_events') IS NOT NULL
        AND to_regprocedure('public.record_app_usage(text,text)') IS NOT NULL
        AND to_regprocedure('public.admin_usage_summary()') IS NOT NULL
        AS "usageSchemaReady"
    `;
    if (!usageSchemaReady) {
      await applyMigration(tx, "0026_admin_usage_analytics.sql", "0026_admin_usage_analytics");
    } else {
      console.log("[db:migrate] Admin usage analytics are already secured.");
    }
  });

  const requiredTables = ["debt_records", "debt_installments", "debt_payments", "debt_payment_promises", "credit_card_records", "business_profiles", "business_profile_audit", "authorized_emails", "plan_entitlements", "plan_pricing", "plan_campaigns", "app_usage_events"];
  const missing = [];
  for (const name of requiredTables) {
    if (!(await tableExists(client, name))) missing.push(name);
  }
  if (missing.length) throw new Error(`Migration verification failed; missing tables: ${missing.join(", ")}`);
  const [{ profileTriggerReady }] = await client`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid=to_regprocedure('public.assign_and_validate_business_profile()')
        AND prosrc LIKE '%IF TG_TABLE_NAME = ''transactions'' THEN%'
        AND prosrc NOT LIKE '%TG_TABLE_NAME = ''transactions'' AND NEW.job_record_id%'
    ) AS "profileTriggerReady"
  `;
  if (!profileTriggerReady) throw new Error("Business-profile trigger verification failed; work-record inserts may still reference transaction-only fields.");
  const unassigned = await client`
    SELECT
      (SELECT count(*)::int FROM public.work_records WHERE kind <> 'settings' AND profile_id IS NULL) AS work_records,
      (SELECT count(*)::int FROM public.transactions WHERE profile_id IS NULL) AS transactions,
      (SELECT count(*)::int FROM public.expenses WHERE profile_id IS NULL) AS expenses
  `;
  const totals = unassigned[0];
  if (totals && (totals.work_records || totals.transactions || totals.expenses)) {
    throw new Error(`Profile migration verification found unassigned records (work=${totals.work_records}, transactions=${totals.transactions}, expenses=${totals.expenses}).`);
  }
  console.log("[db:migrate] Production schema verified for debt, installments and business profiles.");
} catch (error) {
  console.error(`[db:migrate] Failed: ${error?.code ? `${error.code} ` : ""}${error?.message ?? "unknown database error"}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
