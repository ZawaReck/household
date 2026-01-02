/* src/types/Transaction.ts */

export interface Transaction {
  id: string; // Unique identifier for the transaction
  type: "expense" | "income" | "move"; // Type of transaction
  amount: number; // Amount of the transaction (positive for income, negative for expenses)
  date: string; // Date of the transaction in ISO format (YYYY-MM-DD)
  name: string; // Name or description of the transaction
  category: string; // Category of the transaction (e.g., "Food", "Transport")
  source: string; // Source of the transaction (e.g., "Bank", "Cash")
  memo: string; // Optional memo or note for the transaction
  isSpecial: boolean; //
}