import { applyDeletionTombstones, DELETION_TOMBSTONE_KEY, type DeletionTombstones } from "../data/deletionStore";

export type BackupPayload = { version: 1; exportedAt: string; dataEpoch: string; data: Record<string, unknown> };
export type RestoreMode = "replace" | "merge";
export const backupKeys = ["transactions", "accounts.v1", "categories.v1", "budgets", "investments", "accountActualBalances", "sontokuEntries", "scheduledMoves.v1", "drafts.v1", DELETION_TOMBSTONE_KEY];
const keys = backupKeys;
const epochKey = "dataEpoch";
const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
const getOrCreateDataEpoch = () => {
  const current = localStorage.getItem(epochKey);
  if (current) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(epochKey, created);
  return created;
};
export const buildBackup = (): BackupPayload => ({ version: 1, exportedAt: new Date().toISOString(), dataEpoch: getOrCreateDataEpoch(), data: Object.fromEntries(keys.map((key) => [key, read(key)])) });
export const downloadBackup = () => {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `household-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
};

const timestamp = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return String(item.updatedAt ?? item.updatedAtISO ?? item.deletedAt ?? "");
};

export const mergeValues = (current: unknown, incoming: unknown): unknown => {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (incoming.every((item) => item && typeof item === "object" && "id" in item)) {
      const merged = new Map<string, unknown>();
      for (const item of [...current, ...incoming]) {
        if (!item || typeof item !== "object" || !("id" in item)) continue;
        const id = String((item as { id: unknown }).id);
        const previous = merged.get(id);
        if (!previous || timestamp(item) >= timestamp(previous)) merged.set(id, item);
      }
      return Array.from(merged.values());
    }
    return Array.from(new Set([...current, ...incoming].map((item) => JSON.stringify(item)))).map((item) => JSON.parse(item));
  }
  if (current && incoming && typeof current === "object" && typeof incoming === "object") {
    const result = { ...(current as Record<string, unknown>) };
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) result[key] = mergeValues(result[key], value);
    return result;
  }
  return incoming ?? current;
};

export const parseBackup = (raw: string): BackupPayload => {
  const payload = JSON.parse(raw) as Partial<BackupPayload>;
  if (payload.version !== 1 || !payload.data || typeof payload.data !== "object") throw new Error("対応していないバックアップ形式です。");
  return { version: 1, exportedAt: String(payload.exportedAt ?? ""), dataEpoch: String(payload.dataEpoch ?? crypto.randomUUID()), data: payload.data };
};

export const restoreBackup = (payload: BackupPayload, mode: RestoreMode) => {
  downloadBackup();
  const incomingTombstones = payload.data[DELETION_TOMBSTONE_KEY] as DeletionTombstones | undefined;
  const currentTombstones = (read(DELETION_TOMBSTONE_KEY) ?? {}) as DeletionTombstones;
  const mergedTombstones: DeletionTombstones = structuredClone(currentTombstones);
  for (const [collection, entries] of Object.entries(incomingTombstones ?? {})) {
    const mergedEntries = { ...(mergedTombstones[collection] ?? {}) };
    for (const [id, deletedAt] of Object.entries(entries)) {
      if (!mergedEntries[id] || deletedAt > mergedEntries[id]) mergedEntries[id] = deletedAt;
    }
    mergedTombstones[collection] = mergedEntries;
  }
  const tombstones = (mode === "replace"
    ? incomingTombstones ?? {}
    : mergedTombstones) as DeletionTombstones;
  for (const key of keys) {
    if (key === DELETION_TOMBSTONE_KEY) {
      localStorage.setItem(key, JSON.stringify(tombstones));
      void writeOfflineValue(key, tombstones);
      continue;
    }
    const incoming = payload.data[key];
    if (mode === "replace") {
      if (incoming == null) {
        localStorage.removeItem(key);
        void writeOfflineValue(key, null);
      } else {
        const restored = applyDeletionTombstones(key, incoming, tombstones);
        localStorage.setItem(key, JSON.stringify(restored));
        void writeOfflineValue(key, restored);
      }
    } else if (incoming != null) {
      const merged = applyDeletionTombstones(key, mergeValues(read(key), incoming), tombstones);
      localStorage.setItem(key, JSON.stringify(merged));
      void writeOfflineValue(key, merged);
    }
  }
  localStorage.setItem(epochKey, mode === "replace" ? crypto.randomUUID() : (localStorage.getItem(epochKey) ?? payload.dataEpoch));
};
import { writeOfflineValue } from "../data/offlineStore";
