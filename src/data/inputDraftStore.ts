import type { InputDraft } from "../types/InputDraft";
import { writeOfflineValue } from "./offlineStore";
import { recordDeletedIds } from "./deletionStore";

const STORAGE_KEY = "drafts.v1";

const parse = (raw: string | null): InputDraft[] => {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value as InputDraft[] : [];
  } catch {
    return [];
  }
};

export const loadInputDrafts = () => parse(localStorage.getItem(STORAGE_KEY));

export const saveInputDrafts = (drafts: InputDraft[]) => {
  const previous = loadInputDrafts();
  const serialized = JSON.stringify(drafts);
  if (JSON.stringify(previous) === serialized) return;
  const retainedIds = new Set(drafts.map((draft) => draft.id));
  const removedIds = previous.filter((draft) => !retainedIds.has(draft.id)).map((draft) => draft.id);
  recordDeletedIds(STORAGE_KEY, removedIds);
  localStorage.setItem(STORAGE_KEY, serialized);
  void writeOfflineValue(STORAGE_KEY, drafts);
  window.dispatchEvent(new CustomEvent("household-local-change", { detail: STORAGE_KEY }));
};

export const hydrateInputDraftsFromIndexedDB = () => new Promise<InputDraft[]>((resolve) => {
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw != null) {
    const local = parse(localRaw);
    void writeOfflineValue(STORAGE_KEY, local);
    resolve(local);
    return;
  }
  resolve([]);
});
