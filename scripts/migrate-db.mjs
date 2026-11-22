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
  });

  const requiredTables = ["debt_records", "debt_installments", "debt_payments", "credit_card_records"];
  const missing = [];
  for (const name of requiredTables) {
    if (!(await tableExists(client, name))) missing.push(name);
  }
  if (missing.length) throw new Error(`Migration verification failed; missing tables: ${missing.join(", ")}`);
  console.log("[db:migrate] Production schema verified for debt and credit-card installments.");
} catch (error) {
  console.error(`[db:migrate] Failed: ${error?.code ? `${error.code} ` : ""}${error?.message ?? "unknown database error"}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
