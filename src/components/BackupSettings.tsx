import React from "react";
import { downloadBackup } from "../utils/backup";
import "./AccountSettings.css";
export const BackupSettings: React.FC = () => <section className="account-settings"><div className="account-settings-heading"><h2>JSONバックアップ</h2></div><div className="account-editor"><p>取引、口座、カテゴリ、予算、資産更新をJSONで書き出します。</p><div className="account-editor-actions"><button type="button" onClick={downloadBackup}>エクスポート</button></div></div></section>;
