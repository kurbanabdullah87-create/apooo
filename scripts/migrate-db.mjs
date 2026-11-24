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
  });

  const requiredTables = ["debt_records", "debt_installments", "debt_payments", "credit_card_records", "business_profiles", "business_profile_audit"];
  const missing = [];
  for (const name of requiredTables) {
    if (!(await tableExists(client, name))) missing.push(name);
  }
  if (missing.length) throw new Error(`Migration verification failed; missing tables: ${missing.join(", ")}`);
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
