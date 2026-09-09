import React from "react";
import type { Transaction } from "../types/Transaction";
import { importHouseholdCsv, type InvalidCsvRow } from "../utils/csvImport";
import "./AccountSettings.css";

export const CsvImportSettings: React.FC<{ onImport: (transactions: Transaction[]) => void }> = ({ onImport }) => {
  const [result, setResult] = React.useState<{ transactions: Transaction[]; invalidRows: InvalidCsvRow[] } | null>(null);
  const [excludedRows, setExcludedRows] = React.useState<Set<number>>(new Set());
  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setResult(importHouseholdCsv(String(reader.result ?? "")));
      setExcludedRows(new Set());
    };
    reader.readAsText(file);
  };
  const unresolvedCount = result?.invalidRows.filter((row) => !excludedRows.has(row.rowNumber)).length ?? 0;
  return <section className="account-settings">
    <div className="account-settings-heading"><h2>CSV取込</h2></div>
    <div className="account-editor">
      <label>既存家計簿CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
      {result && <>
        <p>{result.transactions.length.toLocaleString()}件を取込可能です。</p>
        {result.invalidRows.length > 0 && <div className="csv-invalid-list">
          <p>不正行は内容を確認し、取込対象から除外してください。</p>
          {result.invalidRows.map((row) => <label key={row.rowNumber} className="csv-invalid-row">
            <input
              type="checkbox"
              checked={excludedRows.has(row.rowNumber)}
              onChange={(event) => setExcludedRows((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(row.rowNumber);
                else next.delete(row.rowNumber);
                return next;
              })}
            />
            <span><strong>{row.rowNumber}行目を除外</strong><small>{row.reason}</small><code>{row.raw}</code></span>
          </label>)}
          <button type="button" onClick={() => setExcludedRows(new Set(result.invalidRows.map((row) => row.rowNumber)))}>すべて除外</button>
        </div>}
        <div className="account-editor-actions">
          <button type="button" disabled={unresolvedCount > 0 || result.transactions.length === 0} onClick={() => {
            if (!window.confirm(`${result.transactions.length.toLocaleString()}件を履歴へ追加しますか？`)) return;
            onImport(result.transactions);
            setResult(null);
            setExcludedRows(new Set());
          }}>履歴へ追加</button>
        </div>
      </>}
    </div>
  </section>;
};
