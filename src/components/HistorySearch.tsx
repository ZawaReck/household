import { useMemo, useState } from "react";
import type { Transaction } from "../types/Transaction";
import { TransactionHistory } from "./TransactionHistory";
import "./HistorySearch.css";

type Props = {
  transactions: Transaction[];
  onClose: () => void;
  onDeleteTransaction: (id: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onSelectGroup: (groupId: string, date: string) => void;
};

export const HistorySearch = ({
  transactions,
  onClose,
  onDeleteTransaction,
  onEditTransaction,
  onSelectGroup,
}: Props) => {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | Transaction["type"]>("all");
  const [category, setCategory] = useState("all");
  const [account, setAccount] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const categories = useMemo(() => Array.from(new Set(transactions.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja")), [transactions]);
  const accounts = useMemo(() => Array.from(new Set(transactions.flatMap((item) => [item.source, item.destination]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja")), [transactions]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ja");
    return transactions.filter((transaction) => {
      if (type !== "all" && transaction.type !== type) return false;
      if (category !== "all" && transaction.category !== category) return false;
      if (account !== "all" && transaction.source !== account && transaction.destination !== account) return false;
      if (dateFrom && transaction.date < dateFrom) return false;
      if (dateTo && transaction.date > dateTo) return false;
      if (!normalized) return true;
      return [
        transaction.name,
        transaction.memo,
        transaction.category,
        transaction.source,
        transaction.destination,
        String(transaction.amount),
      ].some((value) => value?.toLocaleLowerCase("ja").includes(normalized));
    });
  }, [account, category, dateFrom, dateTo, query, transactions, type]);

  return (
    <div className="history-search-backdrop" role="presentation" onClick={onClose}>
      <section
        className="history-search-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-search-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="history-search-header">
          <h2 id="history-search-title">履歴検索</h2>
          <button type="button" aria-label="検索を閉じる" onClick={onClose}>×</button>
        </header>
        <div className="history-search-filters">
          <label className="history-search-query">
            <span>キーワード</span>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="摘要・メモ・カテゴリ・口座・金額"
            />
          </label>
          <label>
            <span>種別</span>
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="all">すべて</option>
              <option value="expense">Out</option>
              <option value="income">In</option>
              <option value="move">Move</option>
            </select>
          </label>
          <label>
            <span>カテゴリ</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">すべて</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>
          <label>
            <span>口座</span>
            <select value={account} onChange={(event) => setAccount(event.target.value)}><option value="all">すべて</option>{accounts.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>
          <label>
            <span>開始日</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            <span>終了日</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>
        <div className="history-search-result-summary">{results.length.toLocaleString()}件</div>
        <div className="history-search-results">
          {results.length > 0 ? (
            <TransactionHistory
              monthlyData={results}
              onDeleteTransaction={onDeleteTransaction}
              onEditTransaction={onEditTransaction}
              onSelectGroup={onSelectGroup}
            />
          ) : (
            <p className="history-search-empty">条件に一致する履歴はありません。</p>
          )}
        </div>
      </section>
    </div>
  );
};
