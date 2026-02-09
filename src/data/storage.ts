/* src/data/storage.ts */

export const safeLoadJSON = <T>(key: string, fallback: T): T => {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (_err) {
    try {
      localStorage.removeItem(key);
    } catch (_err2) {
      // ignore
    }
    return fallback;
  }
};

export const safeSaveJSON = <T>(key: string, value: T) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};
