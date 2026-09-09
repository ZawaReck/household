import type { Transaction } from "../types/Transaction";

const categoryMap: Record<string, string> = { 趣味: "趣味費", ポイント等: "副次収入", 月給: "月収" };

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

export const importHouseholdCsv = (raw: string): { transactions: Transaction[]; invalidRows: number[] } => {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows = lines.slice(1);
  const invalidRows: number[] = [];
  const transactions: Transaction[] = [];
  rows.forEach((line, index) => {
    const [amountRaw, date, memo = "", categoryRaw = "その他"] = splitCsvLine(line);
    const amount = Number(amountRaw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { invalidRows.push(index + 2); return; }
    transactions.push({
      id: crypto.randomUUID(),
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
