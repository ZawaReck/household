import React from "react";
import { downloadBackup, parseBackup, restoreBackup, type RestoreMode } from "../utils/backup";
import "./AccountSettings.css";
export const BackupSettings: React.FC = () => {
  const [mode, setMode] = React.useState<RestoreMode>("merge");
  const [message, setMessage] = React.useState("");
  const restore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseBackup(String(reader.result ?? ""));
        if (mode === "replace" && !window.confirm("現在データを置換します。復元前バックアップは自動ダウンロードされます。続けますか？")) return;
        restoreBackup(payload, mode);
        window.location.reload();
      } catch (error) { setMessage(error instanceof Error ? error.message : "復元に失敗しました。"); }
    };
    reader.readAsText(file);
  };
  return <section className="account-settings"><div className="account-settings-heading"><h2>JSONバックアップ</h2></div><div className="account-editor"><p>取引、口座、カテゴリ、予算、資産更新をJSONで書き出します。</p><div className="account-editor-actions"><button type="button" onClick={downloadBackup}>エクスポート</button></div><label>復元方法<select value={mode} onChange={(event) => setMode(event.target.value as RestoreMode)}><option value="merge">マージ</option><option value="replace">置換</option></select></label><label>バックアップを復元<input type="file" accept="application/json,.json" onChange={restore} /></label>{message && <p>{message}</p>}</div></section>;
};
