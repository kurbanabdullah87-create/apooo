import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.LOVABLE_DB_MIGRATION_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!databaseUrl) {
  console.log("[db:migrate] No direct database URL configured; skipping migrations for this local build.");
  process.exit(0);
}

console.log("[db:migrate] Applying pending Drizzle migrations.");
const cli = resolve(root, "node_modules", "drizzle-kit", "bin.cjs");
const result = spawnSync(process.execPath, [cli, "migrate"], {
  cwd: root,
  env: { ...process.env, LOVABLE_DB_MIGRATION_URL: databaseUrl },
  stdio: "inherit",
});

if (result.error) {
  console.error("[db:migrate] Could not start the migration runner.");
  process.exit(1);
}
process.exit(result.status ?? 1);
