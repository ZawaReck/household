import React from "react";
import { backupKeys } from "../utils/backup";
import { getGoogleIdToken } from "./AuthGate";

type RemoteRecord = { key: string; value: unknown; updatedAt: string; deletedAt?: string | null };
type SyncMeta = { lastPull: string; updatedAt: Record<string, string>; observed: Record<string, string | null> };
const META_KEY = "syncMeta.v1";

const loadMeta = (): SyncMeta => {
  try { return JSON.parse(localStorage.getItem(META_KEY) ?? "") as SyncMeta; }
  catch { return { lastPull: "", updatedAt: {}, observed: {} }; }
};

export const SyncManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const disabled = import.meta.env.DEV && !import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [status, setStatus] = React.useState<"offline" | "syncing" | "synced" | "error">(disabled ? "offline" : "syncing");

  React.useEffect(() => {
    if (disabled) return;
    let stopped = false;
    const sync = async () => {
      const token = getGoogleIdToken();
      if (!token || !navigator.onLine || stopped) { setStatus("offline"); return; }
      setStatus("syncing");
      try {
        const meta = loadMeta();
        const response = await fetch(`/api/sync?since=${encodeURIComponent(meta.lastPull)}`, { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("pull_failed");
        const payload = await response.json() as { records: RemoteRecord[] };
        let appliedRemote = false;
        for (const record of payload.records) {
          if (!backupKeys.includes(record.key) || record.updatedAt < (meta.updatedAt[record.key] ?? "")) continue;
          if (record.deletedAt) localStorage.removeItem(record.key);
          else localStorage.setItem(record.key, JSON.stringify(record.value));
          meta.updatedAt[record.key] = record.updatedAt;
          meta.observed[record.key] = localStorage.getItem(record.key);
          appliedRemote = true;
        }
        meta.lastPull = new Date().toISOString();
        const now = new Date().toISOString();
        const pending: RemoteRecord[] = [];
        for (const key of backupKeys) {
          const raw = localStorage.getItem(key);
          if (meta.observed[key] === raw && meta.updatedAt[key]) continue;
          meta.observed[key] = raw;
          meta.updatedAt[key] = now;
          pending.push({ key, value: raw == null ? null : JSON.parse(raw), updatedAt: now, deletedAt: raw == null ? now : null });
        }
        if (pending.length) {
          const push = await fetch("/api/sync", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ records: pending }) });
          if (!push.ok) throw new Error("push_failed");
        }
        localStorage.setItem(META_KEY, JSON.stringify(meta));
        setStatus("synced");
        if (appliedRemote) window.location.reload();
      } catch { setStatus("error"); }
    };
    void sync();
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("online", sync);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", sync); };
  }, [disabled]);

  const label = { offline: "オフライン", syncing: "同期中", synced: "同期済み", error: "同期失敗" }[status];
  return <><span className={`sync-status sync-${status}`}>{label}</span>{children}</>;
};
