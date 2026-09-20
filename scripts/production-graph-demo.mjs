import { execFileSync } from "node:child_process";

const DATABASE = "household";
const MARKER = "graph-v03";
const ID_PREFIX = "demo-v03-";
const mode = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--apply") ? "apply" : "preview";
const wrangler = "./node_modules/.bin/wrangler";

const execute = (command) => execFileSync(
  wrangler,
  ["d1", "execute", DATABASE, "--remote", "--json", "--command", command],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const query = (command) => JSON.parse(execute(command))[0]?.results ?? [];
const rows = query(`SELECT user_id, record_key, value_json FROM sync_records
  WHERE deleted_at IS NULL OR record_key IN ('investments', 'sontokuEntries')
  ORDER BY user_id, record_key`);
const userIds = [...new Set(rows.map((row) => String(row.user_id)))];
if (userIds.length !== 1) throw new Error(`Expected exactly one production user, found ${userIds.length}.`);
const userId = userIds[0];
const byKey = new Map(rows.filter((row) => String(row.user_id) === userId).map((row) => [String(row.record_key), row.value_json]));
const read = (key, fallback) => {
  const raw = byKey.get(key);
  return raw == null ? structuredClone(fallback) : JSON.parse(String(raw));
};
const now = new Date().toISOString();

const transactions = read("transactions", []).filter((item) => !String(item?.id ?? "").startsWith(ID_PREFIX));
const budgetState = read("budgets", { entries: [] });
budgetState.entries = (Array.isArray(budgetState.entries) ? budgetState.entries : [])
  .filter((item) => item?.demoTag !== MARKER);
const investmentState = read("investments", { assets: [], contributions: [], snapshots: [] });
investmentState.assets = Array.isArray(investmentState.assets) ? investmentState.assets : [];
investmentState.contributions = Array.isArray(investmentState.contributions) ? investmentState.contributions : [];
investmentState.snapshots = (Array.isArray(investmentState.snapshots) ? investmentState.snapshots : [])
  .filter((item) => !String(item?.id ?? "").startsWith(ID_PREFIX));
const sontokuState = read("sontokuEntries", { entries: [] });
sontokuState.entries = (Array.isArray(sontokuState.entries) ? sontokuState.entries : [])
  .filter((item) => !String(item?.id ?? "").startsWith(ID_PREFIX));

const monthKeys = Array.from({ length: 9 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);
if (mode !== "cleanup") {
  const expenseTemplates = [
    ["食料品費", "食料品まとめ", 28_000, "PayPay"],
    ["外食費", "外食まとめ", 9_000, "PayPayクレカ"],
    ["交通費旅費", "交通費まとめ", 6_500, "Suica"],
    ["趣味費", "趣味費まとめ", 4_000, "oliveクレカ"],
    ["雑貨費", "日用品まとめ", 3_500, "PayPay"],
  ];
  monthKeys.forEach((monthKey, index) => {
    transactions.push({
      id: `${ID_PREFIX}${monthKey}-income`,
      type: "income",
      amount: 280_000 + index * 2_500,
      date: `${monthKey}-25`,
      name: "[表示確認] 月収",
      category: "月収",
      source: "ゆうちょ銀行",
      destination: "",
      memo: MARKER,
      classification: "normal",
      isSpecial: false,
      updatedAt: now,
    });
    expenseTemplates.forEach(([category, name, baseAmount, source], categoryIndex) => {
      transactions.push({
        id: `${ID_PREFIX}${monthKey}-expense-${categoryIndex}`,
        type: "expense",
        amount: Number(baseAmount) + index * (categoryIndex + 1) * 350 + (index % 3) * 700,
        date: `${monthKey}-${String(5 + categoryIndex * 4).padStart(2, "0")}`,
        name: `[表示確認] ${name}`,
        category,
        source,
        destination: "",
        memo: MARKER,
        classification: "normal",
        isSpecial: false,
        updatedAt: now,
      });
    });
    sontokuState.entries.push(
      { id: `${ID_PREFIX}${monthKey}-gain`, date: `${monthKey}-08`, kind: "gain", amount: 4_000 + index * 500, note: "[表示確認] 我慢", updatedAt: now },
      { id: `${ID_PREFIX}${monthKey}-loss`, date: `${monthKey}-19`, kind: "loss", amount: 1_500 + (index % 4) * 800, note: "[表示確認] 衝動買い", updatedAt: now },
    );
    if (index < 8) {
      budgetState.entries.push({
        month: monthKey,
        byCategory: {
          "食料品費": 36_000,
          "外食費": 14_000,
          "交通費旅費": 12_000,
          "趣味費": 9_000,
          "雑貨費": 7_000,
        },
        updatedAtISO: now,
        demoTag: MARKER,
      });
    }
  });
  [
    ["nisa", "NISA口座", 80_000],
    ["taxable", "特定口座", 60_000],
    ["crypto", "暗号資産", 30_000],
  ].forEach(([accountId, accountName, amount], index) => {
    transactions.push({
      id: `${ID_PREFIX}2026-09-invest-${index}`,
      type: "move",
      amount,
      date: "2026-09-10",
      name: "[表示確認] 投資入金",
      category: "move",
      source: "PayPay銀行",
      destination: accountName,
      memo: MARKER,
      classification: "normal",
      isSpecial: false,
      relationId: `${ID_PREFIX}invest-relation-${accountId}`,
      updatedAt: now,
    });
  });
  [
    ["2026-09-10", 80_000, 60_000, 30_000],
    ["2026-09-12", 82_000, 59_000, 32_000],
    ["2026-09-15", 85_000, 61_000, 29_000],
    ["2026-09-18", 84_000, 64_000, 34_000],
    ["2026-09-21", 88_000, 66_000, 36_000],
  ].forEach(([date, nisa, taxable, crypto]) => investmentState.snapshots.push({
    id: `${ID_PREFIX}snapshot-${date}`,
    date,
    values: { nisa, taxable, crypto },
  }));
}

const values = {
  transactions,
  budgets: budgetState,
  investments: { ...investmentState, updatedAtISO: now },
  sontokuEntries: sontokuState,
};
const counts = {
  transactions: transactions.filter((item) => String(item?.id ?? "").startsWith(ID_PREFIX)).length,
  budgets: budgetState.entries.filter((item) => item?.demoTag === MARKER).length,
  snapshots: investmentState.snapshots.filter((item) => String(item?.id ?? "").startsWith(ID_PREFIX)).length,
  sontoku: sontokuState.entries.filter((item) => String(item?.id ?? "").startsWith(ID_PREFIX)).length,
};

if (mode === "preview") {
  console.log(JSON.stringify({ mode, userId, counts }, null, 2));
  console.log("Re-run with --apply to insert, or --cleanup to remove, the tagged demo records.");
  process.exit(0);
}

const statements = Object.entries(values).map(([recordKey, value]) => `UPDATE sync_records SET
  value_json = ${quote(JSON.stringify(value))}, updated_at = ${quote(now)}, deleted_at = NULL
  WHERE user_id = ${quote(userId)} AND record_key = ${quote(recordKey)}`);
// The remote D1 query API rejects explicit BEGIN/COMMIT statements. Each
// replacement is idempotent, so a retry safely converges even if a request is
// interrupted between records.
statements.forEach((statement) => execute(statement));
console.log(JSON.stringify({ mode, userId, counts, updatedAt: now }, null, 2));
