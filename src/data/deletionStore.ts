import { safeLoadJSON, safeSaveJSON } from "./storage";

export const DELETION_TOMBSTONE_KEY = "deletionTombstones.v1";
export type DeletionTombstones = Record<string, Record<string, string>>;

export const loadDeletionTombstones = () =>
  safeLoadJSON<DeletionTombstones>(DELETION_TOMBSTONE_KEY, {});

export const saveDeletionTombstones = (value: DeletionTombstones) =>
  safeSaveJSON(DELETION_TOMBSTONE_KEY, value);

export const recordDeletedIds = (collection: string, ids: string[], deletedAt = new Date().toISOString()) => {
  if (ids.length === 0) return;
  const current = loadDeletionTombstones();
  const entries = { ...(current[collection] ?? {}) };
  ids.forEach((id) => { entries[id] = deletedAt; });
  saveDeletionTombstones({ ...current, [collection]: entries });
};

export const restoreDeletedId = (collection: string, id: string) => {
  const current = loadDeletionTombstones();
  if (!current[collection]?.[id]) return;
  const entries = { ...current[collection] };
  delete entries[id];
  saveDeletionTombstones({ ...current, [collection]: entries });
};

const itemTimestamp = (item: unknown) => {
  if (!item || typeof item !== "object") return "";
  const value = item as Record<string, unknown>;
  return String(value.updatedAt ?? value.updatedAtISO ?? value.createdAt ?? "");
};

export const applyDeletionTombstones = (
  collection: string,
  value: unknown,
  tombstones = loadDeletionTombstones(),
) => {
  const deleted = tombstones[collection] ?? {};
  const filter = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) {
      return candidate
        .filter((item) => {
          if (!item || typeof item !== "object" || !("id" in item)) return true;
          const deletedAt = deleted[String((item as { id: unknown }).id)];
          return !deletedAt || itemTimestamp(item) > deletedAt;
        })
        .map(filter);
    }
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(Object.entries(candidate as Record<string, unknown>).map(([key, nested]) => [key, filter(nested)]));
    }
    return candidate;
  };
  return filter(value);
};
