import type { TaxRate, Transaction } from "../types/Transaction";

const normalizeTaxRate = (rate: unknown): TaxRate => rate === 0 || rate === 8 ? rate : 10;

export const calculateExternalReceiptTax = (items: Transaction[]) => {
  const bases = new Map<TaxRate, number>([[0, 0], [8, 0], [10, 0]]);
  items.forEach((item) => {
    const rate = normalizeTaxRate(item.taxRate);
    bases.set(rate, (bases.get(rate) ?? 0) + Number(item.taxBaseAmount ?? item.amount));
  });
  return Math.floor((bases.get(8) ?? 0) * 0.08) + Math.floor((bases.get(10) ?? 0) * 0.1);
};

export const reconcileReceiptTaxAdjustments = (transactions: Transaction[]) => {
  const baseTransactions = transactions.filter((transaction) => !transaction.isTaxAdjustment);
  const existingAdjustments = new Map(
    transactions
      .filter((transaction) => transaction.isTaxAdjustment && transaction.groupId)
      .map((transaction) => [transaction.groupId!, transaction]),
  );
  const groups = new Map<string, Transaction[]>();
  baseTransactions.forEach((transaction) => {
    if (!transaction.groupId || transaction.type !== "expense") return;
    groups.set(transaction.groupId, [...(groups.get(transaction.groupId) ?? []), transaction]);
  });

  const desiredAdjustments: Transaction[] = [];
  groups.forEach((items, groupId) => {
    if (!items.some((item) => item.taxMode === "exclusive")) return;
    const tax = calculateExternalReceiptTax(items);
    if (tax <= 0) return;
    const first = items[0];
    const existing = existingAdjustments.get(groupId);
    const desired: Transaction = {
      ...(existing ?? {}),
      id: existing?.id ?? `tax-adjustment:${groupId}`,
      type: "expense",
      amount: tax,
      date: first.date,
      name: "外税",
      category: "外税",
      source: first.source,
      destination: "",
      memo: "",
      isSpecial: first.classification === "special",
      classification: first.classification ?? "normal",
      groupId,
      isTaxAdjustment: true,
    };
    desiredAdjustments.push(desired);
  });

  return [...baseTransactions, ...desiredAdjustments];
};
