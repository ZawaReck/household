/* src/utils/analytics.ts */

import type { Transaction } from "../types/Transaction";

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
  monthKeys: string[]
) => {
  return monthKeys.map((month) => {
    const monthTx = transactions.filter((t) => getMonthKey(t.date) === month);
    const income = monthTx
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTx
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { month, income, expense, net: income - expense };
  });
};

const calcItemTaxWeight = (t: Transaction) => {
  const base = Number(t.taxBaseAmount ?? t.amount ?? 0);
  const rate = Number(t.taxRate ?? 0);
  if (!Number.isFinite(base) || !Number.isFinite(rate)) return 0;
  const gross = Math.floor(base * (1 + rate / 100));
  const tax = gross - base;
  return tax > 0 ? tax : 0;
};

export const sumExpenseByCategoryAllocatedTax = (
  transactions: Transaction[],
  monthKey: string
) => {
  const monthTx = transactions.filter((t) => getMonthKey(t.date) === monthKey);
  const expenses = monthTx.filter((t) => t.type === "expense");
  const baseItems = expenses.filter((t) => t.isTaxAdjustment !== true);
  const taxItems = expenses.filter((t) => t.isTaxAdjustment === true);

  const categoryMap = new Map<string, number>();

  for (const item of baseItems) {
    if (item.category === "外税") continue;
    const key = item.category || "未分類";
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + item.amount);
  }

  for (const adj of taxItems) {
    if (!adj.groupId) continue;
    const groupItems = baseItems.filter((t) => t.groupId === adj.groupId);
    if (groupItems.length === 0) continue;

    const weights = groupItems.map((t) => calcItemTaxWeight(t));
    let weightTotal = weights.reduce((sum, v) => sum + v, 0);
    if (weightTotal <= 0) {
      weights.splice(0, weights.length, ...groupItems.map((t) => Number(t.taxBaseAmount ?? t.amount ?? 0)));
      weightTotal = weights.reduce((sum, v) => sum + v, 0);
    }
    if (weightTotal <= 0) continue;

    const taxTotal = Number(adj.amount ?? 0);
    let allocated = 0;
    groupItems.forEach((item, idx) => {
      const category = item.category || "未分類";
      if (category === "外税") return;
      const weight = weights[idx];
      let share = 0;
      if (idx === groupItems.length - 1) {
        share = taxTotal - allocated;
      } else {
        share = Math.floor((taxTotal * weight) / weightTotal);
      }
      allocated += share;
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + share);
    });
  }

  return Array.from(categoryMap.entries())
    .filter(([category]) => category !== "外税")
    .map(([category, value]) => ({ category, value }));
};

export const sumExpenseByCategoryAllocatedTaxByMonth = (
  transactions: Transaction[],
  monthKeys: string[],
  category: string
) => {
  return monthKeys.map((month) => {
    const items = sumExpenseByCategoryAllocatedTax(transactions, month);
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
