/* src/data/sontokuStore.ts */

import type { SontokuEntry } from "../types/Sontoku";
import { recordDeletedIds } from "./deletionStore";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "sontokuEntries";

type SontokuState = {
  entries: SontokuEntry[];
};

const defaultState: SontokuState = { entries: [] };

const sanitize = (entries: SontokuEntry[]) =>
  entries
    .filter((e) => e && typeof e === "object")
    .map((e) => ({
      ...e,
      amount: Number(e.amount) || 0,
    }));

export const loadSontokuEntries = (): SontokuEntry[] => {
  const data = safeLoadJSON<SontokuState>(STORAGE_KEY, defaultState);
  if (!data || typeof data !== "object") return [];
  if (!Array.isArray(data.entries)) return [];
  return sanitize(data.entries);
};

export const upsertSontokuEntry = (entry: SontokuEntry) => {
  const current = loadSontokuEntries();
  const next = current.some((e) => e.id === entry.id)
    ? current.map((e) => (e.id === entry.id ? entry : e))
    : [entry, ...current];
  safeSaveJSON(STORAGE_KEY, { entries: next });
};

export const deleteSontokuEntry = (id: string) => {
  const current = loadSontokuEntries();
  const next = current.filter((e) => e.id !== id);
  safeSaveJSON(STORAGE_KEY, { entries: next });
  recordDeletedIds(STORAGE_KEY, [id]);
};
