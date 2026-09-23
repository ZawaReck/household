import React from "react";
import { backupKeys, mergeValues } from "../utils/backup";
import { handleUnauthorized } from "../data/authSession";
import { writeOfflineValue } from "../data/offlineStore";
import { applyDeletionTombstones, DELETION_TOMBSTONE_KEY, loadDeletionTombstones } from "../data/deletionStore";
import {
  adoptDataEpoch,
  clearEpochReplacementPending,
  getOrCreateDataEpoch,
  isEpochReplacementPending,
} from "../data/dataEpoch";
import { syncFingerprint } from "../utils/syncFingerprint";

type RemoteRecord = { key: string; value: unknown; updatedAt: string; deletedAt?: string | null };
type SyncMeta = { lastPull: string; updatedAt: Record<string, string>; observed: Record<string, string | null> };
const META_KEY = "syncMeta.v1";
const SYNC_TIMEOUT_MS = 20_000;

const syncFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

const loadMeta = (): SyncMeta => {
  try { return JSON.parse(localStorage.getItem(META_KEY) ?? "") as SyncMeta; }
  catch { return { lastPull: "", updatedAt: {}, observed: {} }; }
};

export const SyncManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const disabled = import.meta.env.DEV && !import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [status, setStatus] = React.useState<"offline" | "syncing" | "synced" | "error">(disabled ? "offline" : "syncing");
  const [ready, setReady] = React.useState(disabled);

  React.useEffect(() => {
    document.documentElement.dataset.syncStatus = status;
    window.dispatchEvent(new CustomEvent("household-sync-status", { detail: status }));
  }, [status]);

  React.useEffect(() => {
    if (disabled) return;
    let stopped = false;
    let running = false;
    let rerun = false;
    const sync = async (queueIfRunning = true) => {
      if (running) {
        if (queueIfRunning) rerun = true;
        return;
      }
      running = true;
      try {
        if (!navigator.onLine || stopped) { setStatus("offline"); setReady(true); return; }
        setStatus("syncing");
        try {
        const meta = loadMeta();
        const dataEpoch = getOrCreateDataEpoch();
        if (isEpochReplacementPending()) {
          const now = new Date().toISOString();
          const records = backupKeys.map((key): RemoteRecord => {
            const raw = localStorage.getItem(key);
            return { key, value: raw == null ? null : JSON.parse(raw), updatedAt: now, deletedAt: raw == null ? now : null };
          });
          const replace = await syncFetch("/api/sync", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ records, dataEpoch, replaceEpoch: true }),
          });
          if (replace.status === 401) { handleUnauthorized(); return; }
          if (!replace.ok) throw new Error("epoch_replace_failed");
          records.forEach((record) => {
            meta.updatedAt[record.key] = now;
            meta.observed[record.key] = syncFingerprint(localStorage.getItem(record.key));
          });
          meta.lastPull = "";
          localStorage.setItem(META_KEY, JSON.stringify(meta));
          clearEpochReplacementPending();
          setStatus("synced");
          setReady(true);
          return;
        }
        const response = await syncFetch(`/api/sync?since=${encodeURIComponent(meta.lastPull)}`, {
          headers: { "x-data-epoch": dataEpoch },
        });
        if (response.status === 401) { handleUnauthorized(); return; }
        if (response.status === 409) {
          const mismatch = await response.json() as { dataEpoch?: string };
          if (!mismatch.dataEpoch) throw new Error("epoch_mismatch_without_epoch");
          backupKeys.forEach((key) => {
            localStorage.removeItem(key);
            void writeOfflineValue(key, null);
          });
          localStorage.removeItem(META_KEY);
          adoptDataEpoch(mismatch.dataEpoch);
          window.location.reload();
          return;
        }
        if (!response.ok) throw new Error("pull_failed");
        const payload = await response.json() as { records: RemoteRecord[]; serverTime?: string };
        let appliedRemote = false;
        for (const record of payload.records) {
          if (!backupKeys.includes(record.key) || record.updatedAt <= (meta.updatedAt[record.key] ?? "")) continue;
          const previousRaw = localStorage.getItem(record.key);
          const hasObserved = Object.prototype.hasOwnProperty.call(meta.observed, record.key);
          const localDirty = hasObserved ? meta.observed[record.key] !== syncFingerprint(previousRaw) : previousRaw !== null;
          if (record.deletedAt && !localDirty) {
            localStorage.removeItem(record.key);
            void writeOfflineValue(record.key, null);
          } else {
            const localValue = previousRaw == null ? null : JSON.parse(previousRaw);
            const nextValue = localDirty
              ? mergeValues(record.deletedAt ? null : record.value, localValue)
              : record.value;
            localStorage.setItem(record.key, JSON.stringify(nextValue));
            void writeOfflineValue(record.key, nextValue);
          }
          meta.updatedAt[record.key] = record.updatedAt;
          if (!localDirty) meta.observed[record.key] = syncFingerprint(localStorage.getItem(record.key));
          if (previousRaw !== localStorage.getItem(record.key)) appliedRemote = true;
        }
        const tombstones = loadDeletionTombstones();
        for (const key of backupKeys) {
          if (key === DELETION_TOMBSTONE_KEY) continue;
          const raw = localStorage.getItem(key);
          if (raw == null) continue;
          const filtered = JSON.stringify(applyDeletionTombstones(key, JSON.parse(raw), tombstones));
          if (filtered === raw) continue;
          localStorage.setItem(key, filtered);
          void writeOfflineValue(key, JSON.parse(filtered));
        }
        meta.lastPull = payload.serverTime ?? new Date().toISOString();
        const now = new Date().toISOString();
        const pending: RemoteRecord[] = [];
        for (const key of backupKeys) {
          const raw = localStorage.getItem(key);
          const fingerprint = syncFingerprint(raw);
          if (meta.observed[key] === fingerprint && meta.updatedAt[key]) continue;
          meta.observed[key] = fingerprint;
          meta.updatedAt[key] = now;
          pending.push({ key, value: raw == null ? null : JSON.parse(raw), updatedAt: now, deletedAt: raw == null ? now : null });
        }
        if (pending.length) {
          const push = await syncFetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ records: pending, dataEpoch }) });
          if (push.status === 401) { handleUnauthorized(); return; }
          if (!push.ok) throw new Error("push_failed");
        }
        localStorage.setItem(META_KEY, JSON.stringify(meta));
        setStatus("synced");
        if (appliedRemote) window.location.reload();
        else setReady(true);
        } catch { setStatus("error"); setReady(true); }
      } finally {
        running = false;
        if (rerun && !stopped) {
          rerun = false;
          void sync(false);
        }
      }
    };
    void sync();
    const timer = window.setInterval(() => { void sync(false); }, 5000);
    let localChangeTimer: number | undefined;
    const handleLocalChange = () => {
      setStatus("syncing");
      if (localChangeTimer) window.clearTimeout(localChangeTimer);
      localChangeTimer = window.setTimeout(sync, 150);
    };
    const handleOnline = () => { void sync(); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("household-local-change", handleLocalChange);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (localChangeTimer) window.clearTimeout(localChangeTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("household-local-change", handleLocalChange);
    };
  }, [disabled]);

  const label = { offline: "オフライン", syncing: "同期中", synced: "同期済み", error: "同期失敗" }[status];
  return <><span className={`sync-status sync-${status}`}>{label}</span>{ready ? children : <div className="sync-loading">データを同期しています…</div>}</>;
};
