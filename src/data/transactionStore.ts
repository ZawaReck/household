/* src/data/transactionStore.ts */

import type { Transaction } from "../types/Transaction";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "transactions";

export const loadTransactions = (): Transaction[] => {
  const data = safeLoadJSON<Transaction[]>(STORAGE_KEY, []);
  if (!Array.isArray(data)) return [];
  return data.filter((t) => t && typeof t === "object") as Transaction[];
};

export const saveTransactions = (txs: Transaction[]) => {
  safeSaveJSON(STORAGE_KEY, txs);
};
