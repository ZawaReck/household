/* src/utils/analytics.ts */

import type { Transaction } from "../types/Transaction";

export const transactionClassification = (transaction: Transaction) =>
  transaction.classification ?? (transaction.isSpecial ? "special" : "normal");

export const isIncludedInRegularAnalytics = (transaction: Transaction, includeExcluded = false) =>
  includeExcluded || transactionClassification(transaction) === "normal";

export const getMonthKey = (dateISO: string) => dateISO.slice(0, 7);

export const monthEndISO = (monthKey: string) => {
  const [y, m] = monthKey.split("-").map((v) => Number(v));
  const lastDay = new Date(y, m, 0);
  const yyyy = String(lastDay.getFullYear()).padStart(4, "0");
  const mm = String(lastDay.getMonth() + 1).padStart(2, "0");
  const dd = String(lastDay.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const listMonthKeysBetween = (startMonthKey: string, endMonthKey: string) => {
  const keys: string[] = [];
  const [sy, sm] = startMonthKey.split("-").map((v) => Number(v));
  const [ey, em] = endMonthKey.split("-").map((v) => Number(v));
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
  }
  return keys;
};

export const sumIncomeExpenseByMonth = (
  transactions: Transaction[],
  monthKeys: string[],
  includeExcluded = false,
) => {
  return monthKeys.map((month) => {
    const monthTx = transactions.filter(
      (t) => getMonthKey(t.date) === month && isIncludedInRegularAnalytics(t, includeExcluded)
    );
    const income = monthTx
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTx
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { month, income, expense, net: income - expense };
  });
};

const normalizeAnalyticsTaxRate = (rate: unknown) => rate === 8 || rate === 10 ? rate : 0;

export const sumExpenseByCategoryAllocatedTax = (
  transactions: Transaction[],
  monthKey: string,
  includeExcluded = false,
) => {
  const monthTx = transactions.filter(
    (t) => getMonthKey(t.date) === monthKey && isIncludedInRegularAnalytics(t, includeExcluded)
  );
  const expenses = monthTx.filter((t) => t.type === "expense");
  const baseItems = expenses.filter((t) => t.isTaxAdjustment !== true);
  const categoryMap = new Map<string, number>();
  const grouped = new Map<string, Transaction[]>();
  for (const item of baseItems) {
    if (item.category === "外税") continue;
    const key = item.groupId ?? `item:${item.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  for (const items of grouped.values()) {
    const isExternal = items.some((item) => item.taxMode === "exclusive");
    if (!isExternal) {
      items.forEach((item) => {
        const category = item.category || "未分類";
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + item.amount);
      });
      continue;
    }

    const bases = new Map<string, number>();
    items.forEach((item) => {
      const category = item.category || "未分類";
      const rate = normalizeAnalyticsTaxRate(item.taxRate);
      const key = `${category}\u0000${rate}`;
      bases.set(key, (bases.get(key) ?? 0) + Number(item.taxBaseAmount ?? item.amount ?? 0));
    });
    bases.forEach((base, key) => {
      const [category, rateText] = key.split("\u0000");
      const gross = Math.floor(base * (1 + Number(rateText) / 100));
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + gross);
    });
  }

  return Array.from(categoryMap.entries())
    .filter(([category]) => category !== "外税")
    .map(([category, value]) => ({ category, value }));
};

export const sumExpenseByCategoryAllocatedTaxByMonth = (
  transactions: Transaction[],
  monthKeys: string[],
  category: string,
  includeExcluded = false,
) => {
  return monthKeys.map((month) => {
    const items = sumExpenseByCategoryAllocatedTax(transactions, month, includeExcluded);
    const found = items.find((i) => i.category === category);
    return { month, value: found ? found.value : 0 };
  });
};

export const calcAccountBalancesAsOf = (
  transactions: Transaction[],
  asOfISO: string,
  accounts: string[]
) => {
  const balances: Record<string, number> = {};
  accounts.forEach((acc) => {
    balances[acc] = 0;
  });
  transactions
    .filter((t) => t.date <= asOfISO)
    .forEach((t) => {
      const amount = Number(t.amount ?? 0);
      if (t.type === "income") {
        if (t.source) balances[t.source] = (balances[t.source] ?? 0) + amount;
      } else if (t.type === "expense") {
        if (t.source) balances[t.source] = (balances[t.source] ?? 0) - amount;
      } else if (t.type === "move") {
        if (t.source) balances[t.source] = (balances[t.source] ?? 0) - amount;
        if (t.destination)
          balances[t.destination] = (balances[t.destination] ?? 0) + amount;
      }
    });
  return balances;
};
