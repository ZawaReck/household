/* src/types/Sontoku.ts */

export interface SontokuEntry {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "gain" | "loss";
  amount: number;
  note?: string;
}
