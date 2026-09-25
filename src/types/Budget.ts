/* src/types/Budget.ts */

export interface BudgetEntry {
  month: string; // YYYY-MM
  byCategory: Record<string, number>;
  /** カテゴリ未設定分を含む月全体の予算。設定済みカテゴリ合計を下回る場合は合計値を優先する。 */
  totalBudget?: number;
  updatedAtISO?: string;
}
