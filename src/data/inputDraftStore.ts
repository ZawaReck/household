import type { InputDraft } from "../types/InputDraft";

const STORAGE_KEY = "drafts.v1";
const DB_NAME = "household-local";
const STORE_NAME = "key-value";

const parse = (raw: string | null): InputDraft[] => {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value as InputDraft[] : [];
  } catch {
    return [];
  }
};

export const loadInputDrafts = () => parse(localStorage.getItem(STORAGE_KEY));

const writeIndexedDB = (drafts: InputDraft[]) => {
  if (!("indexedDB" in window)) return;
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(drafts, STORAGE_KEY);
    transaction.oncomplete = () => db.close();
  };
};

export const saveInputDrafts = (drafts: InputDraft[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  writeIndexedDB(drafts);
  window.dispatchEvent(new CustomEvent("household-local-change", { detail: STORAGE_KEY }));
};

export const hydrateInputDraftsFromIndexedDB = () => new Promise<InputDraft[]>((resolve) => {
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw != null) {
    const local = parse(localRaw);
    writeIndexedDB(local);
    resolve(local);
    return;
  }
  if (!("indexedDB" in window)) { resolve([]); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onerror = () => resolve(loadInputDrafts());
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(STORE_NAME, "readonly");
    const read = transaction.objectStore(STORE_NAME).get(STORAGE_KEY);
    read.onerror = () => resolve(loadInputDrafts());
    read.onsuccess = () => {
      const result = Array.isArray(read.result) ? read.result as InputDraft[] : [];
      if (result.length) saveInputDrafts(result);
      resolve(result);
      db.close();
    };
  };
});
