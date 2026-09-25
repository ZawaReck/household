/* src/data/budgetStore.ts */

import type { BudgetEntry } from "../types/Budget";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "budgets";

type BudgetState = {
  entries: BudgetEntry[];
};

const defaultState: BudgetState = { entries: [] };

export const loadBudgets = (): BudgetEntry[] => {
  const data = safeLoadJSON<BudgetState>(STORAGE_KEY, defaultState);
  if (!data || typeof data !== "object") return [];
  return Array.isArray(data.entries) ? data.entries : [];
};

export const saveBudgets = (entries: BudgetEntry[]) => {
  safeSaveJSON(STORAGE_KEY, { entries });
};
