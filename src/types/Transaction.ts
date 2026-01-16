/* src/types/Transaction.ts */

export type TaxMode = "inclusive" | "exclusive";
export type TaxRate = 0 | 8 | 10;

export interface Transaction {
  id: string; // Unique identifier for the transaction
  type: "expense" | "income" | "move"; // Type of transaction
  amount: number; // Amount of the transaction (income/expense are both stored as positive numbers)
  date: string; // Date of the transaction in ISO format (YYYY-MM-DD)
  name: string; // Name or description of the transaction
  category: string; // Category of the transaction (e.g., "Food", "Transport")
  source: string; // Source of the transaction (e.g., "Bank", "Cash")
  memo: string; // Optional memo or note for the transaction
  destination: string; // Destination of the transaction (e.g., "Bank", "Cash")
  isSpecial: boolean;
  groupId?: string;

taxMode?: TaxMode;
taxRate?: TaxRate;
taxBaseAmount?: number;
isTaxAdjustment?: boolean;
}
