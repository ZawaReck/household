import type { TaxRate, TransactionClassification } from "./Transaction";
import type { Transaction } from "./Transaction";

export type InputDraft = {
  id: string;
  scope: string;
  type: Transaction["type"];
  amount: string;
  date: string;
  name: string;
  category: string;
  source: string;
  sourceMove: string;
  destination: string;
  memo: string;
  classification: TransactionClassification;
  moveFee: string;
  entryMode: "individual" | "receipt_inclusive" | "receipt_exclusive";
  taxRate: TaxRate;
  receiptItems: Array<Omit<Transaction, "id">>;
  updatedAt: string;
};
