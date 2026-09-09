import { applyDeletionTombstones, DELETION_TOMBSTONE_KEY, type DeletionTombstones } from "../data/deletionStore";
import { getOrCreateDataEpoch, rotateDataEpoch } from "../data/dataEpoch";
import { localDateISO } from "./date";

export type BackupPayload = { version: 1; exportedAt: string; dataEpoch: string; data: Record<string, unknown> };
export type RestoreMode = "replace" | "merge";
export const backupKeys = ["transactions", "accounts.v1", "categories.v1", "budgets", "investments", "accountActualBalances", "sontokuEntries", "scheduledMoves.v1", "drafts.v1", DELETION_TOMBSTONE_KEY];
const keys = backupKeys;
const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
export const buildBackup = (): BackupPayload => ({ version: 1, exportedAt: new Date().toISOString(), dataEpoch: getOrCreateDataEpoch(), data: Object.fromEntries(keys.map((key) => [key, read(key)])) });
export const downloadBackup = () => {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `household-backup-${localDateISO()}.json`; link.click(); URL.revokeObjectURL(url);
};

const timestamp = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return String(item.updatedAt ?? item.updatedAtISO ?? item.deletedAt ?? "");
};

export const mergeValues = (current: unknown, incoming: unknown): unknown => {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const objectItems = [...current, ...incoming].filter((item) => item != null);
    const mergeKey = objectItems.length > 0 && objectItems.every((item) => typeof item === "object" && item && "id" in item)
      ? "id"
      : objectItems.length > 0 && objectItems.every((item) => typeof item === "object" && item && "month" in item)
        ? "month"
        : null;
    if (mergeKey) {
      const merged = new Map<string, unknown>();
      for (const item of [...current, ...incoming]) {
        if (!item || typeof item !== "object" || !(mergeKey in item)) continue;
        const key = String((item as Record<string, unknown>)[mergeKey]);
        const previous = merged.get(key);
        if (!previous || timestamp(item) >= timestamp(previous)) merged.set(key, item);
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
  if (mode === "replace") rotateDataEpoch();
  else if (!localStorage.getItem("dataEpoch")) localStorage.setItem("dataEpoch", payload.dataEpoch);
};
import { writeOfflineValue } from "../data/offlineStore";
