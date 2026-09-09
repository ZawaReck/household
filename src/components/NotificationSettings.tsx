import React from "react";
import { getGoogleIdToken } from "./AuthGate";
import "./AccountSettings.css";

const decodeKey = (value: string) => {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

export const NotificationSettings: React.FC = () => {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [enabled, setEnabled] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setEnabled(Boolean(subscription)));
  }, [supported]);

  const authHeaders = () => ({ authorization: `Bearer ${getGoogleIdToken() ?? ""}` });
  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("通知が許可されていません。"); return; }
      const keyResponse = await fetch("/api/push/public-key", { headers: authHeaders() });
      if (!keyResponse.ok) throw new Error("key");
      const { publicKey } = await keyResponse.json() as { publicKey: string };
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("save");
      setEnabled(true);
      setMessage("毎朝9:00の月末更新通知を有効にしました。");
    } catch {
      setMessage("通知を有効にできませんでした。ホーム画面へ追加したPWAから再度お試しください。");
    }
  };
  const disable = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscriptions", { method: "DELETE", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
    setEnabled(false);
    setMessage("通知を無効にしました。");
  };

  return <section className="account-settings"><div className="account-settings-heading"><h2>通知</h2>{supported && <button type="button" onClick={enabled ? disable : enable}>{enabled ? "無効にする" : "有効にする"}</button>}</div><p>{supported ? "月末当日と、未更新の翌月以降に毎朝9:00通知します。" : "このブラウザはプッシュ通知に対応していません。"}</p>{message && <p>{message}</p>}</section>;
};
