// src/dev/demoData.ts
import { saveTransactions } from "../data/transactionStore";
import { saveBudgets } from "../data/budgetStore";
import { saveInvestmentState } from "../data/investmentStore";
import { safeSaveJSON } from "../data/storage";

const KEYS = [
  "transactions",
  "budgets",
  "accountActualBalances",
  "investments",
  "sontokuEntries",
] as const;

export function clearDemoData() {
  for (const k of KEYS) localStorage.removeItem(k);
}

// local があれば local、なければ sample を読む
async function fetchJsonPreferLocal() {
  const tryLocal = await fetch("/fixtures/demoData.local.json");
  if (tryLocal.ok) return tryLocal.json();

  const fallback = await fetch("/fixtures/demoData.sample.json");
  if (!fallback.ok) throw new Error("demoData.sample.json が見つかりません");
  return fallback.json();
}

export async function loadDemoData() {
  const all = await fetchJsonPreferLocal();

  // ↓↓↓ あなたのストアのキーに合わせて分配する
  saveTransactions(all.transactions ?? []);
  saveBudgets(all.budgets ?? []);
  safeSaveJSON("accountActualBalances", all.accountActualBalances ?? {});
  saveInvestmentState(all.investments ?? {});
  safeSaveJSON("sontokuEntries", all.sontokuEntries ?? { entries: [] });

  return all?.meta ?? null;
}
