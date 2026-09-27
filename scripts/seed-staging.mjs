import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = join(root, "fixtures", "staging-seed.json");
const wranglerPath = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const accounts = fixture?.data?.["accounts.v1"];
if (!Array.isArray(accounts) || accounts.length === 0 || accounts.some((account) => !String(account.name).startsWith("STG"))) {
  throw new Error("Refusing to seed: fixture accounts must all use STG-prefixed names.");
}

const runWranglerJson = (args) => {
  const output = execFileSync(process.execPath, [wranglerPath, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const jsonStart = output.search(/[\[{]/);
  if (jsonStart < 0) throw new Error("Wrangler did not return JSON output.");
  return JSON.parse(output.slice(jsonStart));
};

const query = runWranglerJson([
  "d1", "execute", "DB", "--env", "staging", "--remote", "--json",
  "--command", "SELECT user_id, data_epoch FROM sync_epochs ORDER BY updated_at DESC",
]);
const users = query?.[0]?.results ?? [];
if (users.length !== 1) {
  throw new Error(`Refusing to seed: expected exactly one staging user, found ${users.length}.`);
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const userId = String(users[0].user_id);
const dataEpoch = String(users[0].data_epoch);
const updatedAt = new Date().toISOString();
const statements = [
  `DELETE FROM sync_records WHERE user_id = ${quote(userId)};`,
  ...Object.entries(fixture.data).map(([key, value]) =>
    `INSERT INTO sync_records (user_id, record_key, value_json, updated_at, deleted_at, data_epoch) VALUES (${quote(userId)}, ${quote(key)}, ${quote(JSON.stringify(value))}, ${quote(updatedAt)}, NULL, ${quote(dataEpoch)});`
  ),
  `UPDATE sync_epochs SET updated_at = ${quote(updatedAt)} WHERE user_id = ${quote(userId)};`,
];

const sqlPath = join(tmpdir(), `household-staging-seed-${process.pid}.sql`);
try {
  writeFileSync(sqlPath, `${statements.join("\n")}\n`, { mode: 0o600 });
  const result = runWranglerJson([
    "d1", "execute", "DB", "--env", "staging", "--remote", "--json", "--yes", "--file", sqlPath,
  ]);
  if (!Array.isArray(result) || result.some((entry) => entry.success !== true)) {
    throw new Error("Staging seed execution failed.");
  }
  console.log(`Seeded ${Object.keys(fixture.data).length} records into the staging D1 database.`);
} finally {
  try { unlinkSync(sqlPath); } catch { /* The temporary file may not exist after an earlier failure. */ }
}
