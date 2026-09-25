/* src/types/Investment.ts */

export type MonthKey = `${number}-${string}`;

export interface InvestmentAsset {
  id: string;
  name: string;
  initialPrincipal: number;
  openingValue?: number;
  recurring?: {
    amount: number;
    startMonth: MonthKey;
    dayOfMonth: number;
  };
}

export interface InvestmentContribution {
  id: string;
  assetId: string;
  month: MonthKey;
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface InvestmentSnapshot {
  id: string;
  date: string; // YYYY-MM-DD
  values: Record<string, number>;
}

export interface InvestmentState {
  assets: InvestmentAsset[];
  contributions: InvestmentContribution[];
  snapshots: InvestmentSnapshot[];
  updatedAtISO?: string;
}
