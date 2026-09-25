const DB_NAME = "household-local";
const STORE_NAME = "key-value";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const writeOfflineValue = async (key: string, value: unknown | null) => {
  if (!("indexedDB" in window)) return;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (value == null) store.delete(key); else store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // localStorage remains the synchronous fallback when IndexedDB is unavailable.
  }
};

export const hydrateOfflineStorage = async (keys: readonly string[]) => {
  if (!("indexedDB" in window)) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    await Promise.all(keys.map(async (key) => {
      if (localStorage.getItem(key) != null) return;
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db!.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    }));
  } catch {
    // Continue with localStorage if IndexedDB cannot be opened.
  } finally {
    db?.close();
  }
};
