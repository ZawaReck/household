import React from "react";
import type { Transaction } from "../types/Transaction";
import { importHouseholdCsv } from "../utils/csvImport";
import "./AccountSettings.css";

export const CsvImportSettings: React.FC<{ onImport: (transactions: Transaction[]) => void }> = ({ onImport }) => {
  const [result, setResult] = React.useState<{ transactions: Transaction[]; invalidRows: number[] } | null>(null);
  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setResult(importHouseholdCsv(String(reader.result ?? "")));
    reader.readAsText(file);
  };
  return <section className="account-settings">
    <div className="account-settings-heading"><h2>CSV取込</h2></div>
    <div className="account-editor">
      <label>既存家計簿CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
      {result && <><p>{result.transactions.length.toLocaleString()}件を取込可能です。</p>{result.invalidRows.length > 0 && <p>不正行: {result.invalidRows.join(", ")}</p>}<div className="account-editor-actions"><button type="button" disabled={result.invalidRows.length > 0} onClick={() => { onImport(result.transactions); setResult(null); }}>履歴へ追加</button></div></>}
    </div>
  </section>;
};
