import React from "react";
import type { Account, AccountKind } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { accountBalanceAsOf, hasFutureAccountActivity } from "../utils/accountBalances";
import "./AccountSettings.css";

type Props = {
  accounts: Account[];
  transactions: Transaction[];
  onSave: (account: Account) => void;
};

const kindLabels: Record<AccountKind, string> = {
  cash: "現金",
  bank: "銀行",
  electronic_money: "電子マネー",
  investment: "投資",
  credit_card: "クレジットカード",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const newAccount = (): Account => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    kind: "bank",
    openingBalance: 0,
    openingDate: todayISO(),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const AccountSettings: React.FC<Props> = ({ accounts, transactions, onSave }) => {
  const [draft, setDraft] = React.useState<Account | null>(null);
  const today = todayISO();

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
    setDraft(null);
  };

  const toggleActive = (account: Account) => {
    if (account.isActive) {
      const balance = accountBalanceAsOf(account, transactions, today);
      if (balance !== 0 || hasFutureAccountActivity(account, transactions, today)) {
        window.alert("無効化には、今日時点の残高が0円で未来の取引・Moveがないことが必要です。");
        return;
      }
    }
    onSave({ ...account, isActive: !account.isActive, updatedAt: new Date().toISOString() });
  };

  return (
    <section className="account-settings">
      <div className="account-settings-heading">
        <h2>口座・支払手段</h2>
        <button type="button" onClick={() => setDraft(newAccount())}>追加</button>
      </div>

      <div className="account-list">
        {accounts.map((account) => (
          <article key={account.id} className={`account-row ${account.isActive ? "" : "is-inactive"}`}>
            <button type="button" className="account-edit" onClick={() => setDraft(account)}>
              <strong>{account.name}</strong>
              <span>{kindLabels[account.kind]} · 開始残高 {account.openingBalance.toLocaleString()}円</span>
            </button>
            <button type="button" className="account-toggle" onClick={() => toggleActive(account)}>
              {account.isActive ? "無効化" : "有効化"}
            </button>
          </article>
        ))}
      </div>

      {draft && (
        <div className="account-editor">
          <h3>{accounts.some((account) => account.id === draft.id) ? "口座を編集" : "口座を追加"}</h3>
          <label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>種別
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as AccountKind })}>
              {Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          </label>
          <label>開始残高<input type="number" value={draft.openingBalance} onChange={(event) => setDraft({ ...draft, openingBalance: Number(event.target.value) })} /></label>
          <label>開始基準日<input type="date" value={draft.openingDate} onChange={(event) => setDraft({ ...draft, openingDate: event.target.value })} /></label>
          <div className="account-editor-actions"><button type="button" onClick={() => setDraft(null)}>取消</button><button type="button" onClick={save}>保存</button></div>
        </div>
      )}
    </section>
  );
};
