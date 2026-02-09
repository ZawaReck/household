/* src/data/accountActualStore.ts */

import { safeLoadJSON, safeSaveJSON } from "./storage";

export type AccountActualState = {
  byMonth: Record<string, Record<string, number>>;
};

const STORAGE_KEY = "accountActualBalances";

const defaultState: AccountActualState = { byMonth: {} };

export const loadAccountActualState = (): AccountActualState => {
  const data = safeLoadJSON<AccountActualState>(STORAGE_KEY, defaultState);
  if (!data || typeof data !== "object") return { ...defaultState };
  return {
    byMonth: data.byMonth && typeof data.byMonth === "object" ? data.byMonth : {},
  };
};

export const saveAccountActualState = (state: AccountActualState) => {
  safeSaveJSON(STORAGE_KEY, state);
};
