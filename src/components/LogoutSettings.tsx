import React from "react";
import { clearGoogleIdToken } from "./AuthGate";
import "./AccountSettings.css";

export const LogoutSettings: React.FC = () => {
  const [status, setStatus] = React.useState(() => document.documentElement.dataset.syncStatus ?? "offline");
  React.useEffect(() => {
    const update = (event: Event) => setStatus(String((event as CustomEvent).detail));
    window.addEventListener("household-sync-status", update);
    return () => window.removeEventListener("household-sync-status", update);
  }, []);
  const logout = () => {
    if (status !== "synced") { window.alert("未同期データがある可能性があるため、同期完了までログアウトできません。"); return; }
    clearGoogleIdToken(); window.google?.accounts.id.disableAutoSelect(); window.location.reload();
  };
  return <section className="account-settings"><div className="account-settings-heading"><h2>アカウント</h2><button type="button" onClick={logout}>ログアウト</button></div><p>同期状態: {status}</p></section>;
};
