/**
 * One-shot: apply supabase/migrations/add-multi-address-wallets.sql
 *
 * Usage:
 *   node scripts/apply-multi-address-migration.mjs
 *
 * Prefers DATABASE_URL / DIRECT_URL / POSTGRES_URL (psql or pg).
 * If SUPABASE_ACCESS_TOKEN is set, attempts Supabase Management API
 * (requires SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlPath = resolve(root, "supabase/migrations/add-multi-address-wallets.sql");

function loadDotEnvLocal() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvLocal();

const sql = existsSync(sqlPath)
  ? readFileSync(sqlPath, "utf8")
  : null;

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  null;

const token = process.env.SUPABASE_ACCESS_TOKEN || null;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/i
  )?.[1] ||
  null;

console.log("=== Multi-address wallets migration ===\n");
console.log(`SQL file: ${sqlPath}`);
console.log(`SQL present: ${Boolean(sql)}`);
console.log(`DATABASE_URL/DIRECT_URL/POSTGRES_URL: ${dbUrl ? "set" : "missing"}`);
console.log(`SUPABASE_ACCESS_TOKEN: ${token ? "set" : "missing"}`);
console.log(`Project ref: ${projectRef || "missing"}\n`);

if (!sql) {
  console.error("Migration SQL not found. Aborting.");
  process.exit(1);
}

function printManualInstructions() {
  console.log(`
Manual apply (recommended if no DB URL / token):

1. Open Supabase Dashboard → SQL Editor for your project
2. Paste contents of:
   supabase/migrations/add-multi-address-wallets.sql
3. Run the statement

Or set one of:
  DATABASE_URL / DIRECT_URL / POSTGRES_URL  (Postgres connection string)
  SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL)

Then re-run:
  node scripts/apply-multi-address-migration.mjs
`);
}

async function applyViaPostgresUrl(url) {
  console.log("Attempting apply via Postgres URL (psql)...");
  const psql = spawnSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
    { encoding: "utf8", shell: true }
  );
  if (psql.error && psql.error.code === "ENOENT") {
    console.log("psql not found on PATH. Install PostgreSQL client tools, or apply via SQL Editor.");
    return false;
  }
  if (psql.status === 0) {
    console.log(psql.stdout || "OK");
    console.log("Migration applied via psql.");
    return true;
  }
  console.error(psql.stderr || psql.stdout || "psql failed");
  return false;
}

async function applyViaManagementApi() {
  if (!token) {
    console.log("SUPABASE_ACCESS_TOKEN not set — skipping Management API.");
    return false;
  }
  if (!projectRef) {
    console.log(
      "SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL) missing — cannot call Management API."
    );
    return false;
  }

  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  console.log(`Attempting Management API: POST ${endpoint}`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!res.ok) {
      console.error(`Management API failed (${res.status}):`, body);
      console.log(
        "\nNote: Some projects/plans do not expose database/query. Use SQL Editor instead."
      );
      return false;
    }
    console.log("Management API response:", body);
    console.log("Migration applied via Management API (if endpoint supported).");
    return true;
  } catch (err) {
    console.error("Management API request error:", err);
    return false;
  }
}

let ok = false;
if (dbUrl) {
  ok = await applyViaPostgresUrl(dbUrl);
}
if (!ok && token) {
  ok = await applyViaManagementApi();
}
if (!ok) {
  printManualInstructions();
  process.exit(2);
}
process.exit(0);
