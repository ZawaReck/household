/* src/data/accountActualStore.ts */

import { safeLoadJSON, safeSaveJSON } from "./storage";

export type AccountActualState = {
  byMonth: Record<string, Record<string, number>>;
  confirmedByMonth: Record<string, string[]>;
  basisDateByMonth: Record<string, string>;
};

const STORAGE_KEY = "accountActualBalances";

const defaultState: AccountActualState = { byMonth: {}, confirmedByMonth: {}, basisDateByMonth: {} };

export const loadAccountActualState = (): AccountActualState => {
  const data = safeLoadJSON<AccountActualState>(STORAGE_KEY, defaultState);
  if (!data || typeof data !== "object") return { ...defaultState };
  return {
    byMonth: data.byMonth && typeof data.byMonth === "object" ? data.byMonth : {},
    confirmedByMonth:
      data.confirmedByMonth && typeof data.confirmedByMonth === "object"
        ? data.confirmedByMonth
        : {},
    basisDateByMonth:
      data.basisDateByMonth && typeof data.basisDateByMonth === "object"
        ? data.basisDateByMonth
        : {},
  };
};

export const saveAccountActualState = (state: AccountActualState) => {
  safeSaveJSON(STORAGE_KEY, state);
};
