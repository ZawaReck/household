import type { Transaction } from "../types/Transaction";

const categoryMap: Record<string, string> = { 趣味: "趣味費", ポイント等: "副次収入", 月給: "月収" };

const stableRowId = (value: string) => {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `csv_${hash.toString(16).padStart(16, "0")}`;
};

export type InvalidCsvRow = {
  rowNumber: number;
  raw: string;
  reason: string;
};

const splitCsvLine = (line: string) => {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { fields.push(current); current = ""; }
    else current += char;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export const importHouseholdCsv = (raw: string): { transactions: Transaction[]; invalidRows: InvalidCsvRow[] } => {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows = lines.slice(1);
  const invalidRows: InvalidCsvRow[] = [];
  const transactions: Transaction[] = [];
  rows.forEach((line, index) => {
    const [amountRaw, date, memo = "", categoryRaw = "その他"] = splitCsvLine(line);
    const amount = Number(amountRaw.replace(/,/g, ""));
    const errors: string[] = [];
    if (!Number.isFinite(amount)) errors.push("金額が数値ではありません");
    else if (!Number.isInteger(amount) || amount === 0) errors.push("金額は0以外の円整数である必要があります");
    if (!isValidDate(date)) errors.push("日付が YYYY-MM-DD の実在日ではありません");
    if (errors.length > 0) {
      invalidRows.push({ rowNumber: index + 2, raw: line, reason: errors.join(" / ") });
      return;
    }
    transactions.push({
      id: stableRowId(`${index + 2}\u0000${line}`),
      updatedAt: new Date().toISOString(),
      type: amount < 0 ? "expense" : "income",
      amount: Math.abs(amount),
      date,
      name: memo || "CSV取込",
      category: categoryMap[categoryRaw] ?? (categoryRaw || "その他"),
      source: "",
      destination: "",
      memo: "",
      isSpecial: false,
      classification: "normal",
    });
  });
  return { transactions, invalidRows };
};
