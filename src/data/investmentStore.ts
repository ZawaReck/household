/* src/data/investmentStore.ts */

import type { InvestmentState } from "../types/Investment";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "investments";

const defaultState: InvestmentState = {
  assets: [],
  contributions: [],
  snapshots: [],
};

export const loadInvestmentState = (): InvestmentState => {
  const data = safeLoadJSON<InvestmentState>(STORAGE_KEY, defaultState);
  if (!data || typeof data !== "object") return { ...defaultState };
  return {
    assets: Array.isArray(data.assets) ? data.assets : [],
    contributions: Array.isArray(data.contributions) ? data.contributions : [],
    snapshots: Array.isArray(data.snapshots) ? data.snapshots : [],
    updatedAtISO: data.updatedAtISO,
  };
};

export const saveInvestmentState = (state: InvestmentState) => {
  safeSaveJSON(STORAGE_KEY, {
    ...state,
    updatedAtISO: new Date().toISOString(),
  });
};
