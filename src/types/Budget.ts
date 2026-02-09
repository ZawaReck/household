/* src/types/Budget.ts */

export interface BudgetEntry {
  month: string; // YYYY-MM
  byCategory: Record<string, number>;
  updatedAtISO?: string;
}
