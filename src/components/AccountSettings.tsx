import React from "react";
import type { Account, AccountKind } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import {
  accountBalanceAsOf,
  creditCardOutstandingAsOf,
  hasFutureAccountActivity,
  hasFutureAutomaticCardPayment,
} from "../utils/accountBalances";
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

const cardDefaults = () => ({
  limit: 0,
  closingDay: 31,
  paymentDay: 27,
  paymentDelayMonths: 1,
});

export const AccountSettings: React.FC<Props> = ({ accounts, transactions, onSave }) => {
  const [draft, setDraft] = React.useState<Account | null>(null);
  const today = todayISO();

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
    setDraft(null);
  };

  const changeKind = (kind: AccountKind) => {
    if (!draft) return;
    setDraft({
      ...draft,
      kind,
      creditCard: kind === "credit_card" ? draft.creditCard ?? cardDefaults() : undefined,
    });
  };

  const paymentAccounts = accounts.filter(
    (account) => account.isActive && account.kind !== "credit_card" && account.id !== draft?.id
  );

  const toggleActive = (account: Account) => {
    if (account.isActive) {
      if (account.kind === "credit_card") {
        const outstanding = creditCardOutstandingAsOf(account, transactions, today);
        if (outstanding !== 0 || hasFutureAutomaticCardPayment(account, transactions, today)) {
          window.alert("カードの無効化には、未引落利用額が0円で未来の自動引落Moveがないことが必要です。");
          return;
        }
      } else {
        const balance = accountBalanceAsOf(account, transactions, today);
        if (balance !== 0 || hasFutureAccountActivity(account, transactions, today)) {
          window.alert("無効化には、今日時点の残高が0円で未来の取引・Moveがないことが必要です。");
          return;
        }
      }
    }
    onSave({
      ...account,
      isActive: !account.isActive,
      disabledAt: account.isActive ? today : undefined,
      updatedAt: new Date().toISOString(),
    });
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
            <select value={draft.kind} onChange={(event) => changeKind(event.target.value as AccountKind)}>
              {Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          </label>
          <label>開始残高<input type="number" value={draft.openingBalance} onChange={(event) => setDraft({ ...draft, openingBalance: Number(event.target.value) })} /></label>
          {draft.kind === "investment" && (
            <label>開始時点損益<input type="number" value={draft.initialProfit ?? 0} onChange={(event) => setDraft({ ...draft, initialProfit: Number(event.target.value) })} /></label>
          )}
          <label>開始基準日<input type="date" value={draft.openingDate} onChange={(event) => setDraft({ ...draft, openingDate: event.target.value })} /></label>
          {draft.kind === "credit_card" && draft.creditCard && (
            <fieldset className="card-settings-fields">
              <legend>カード設定</legend>
              <label>利用限度額<input type="number" min="0" value={draft.creditCard.limit} onChange={(event) => setDraft({ ...draft, creditCard: { ...draft.creditCard!, limit: Number(event.target.value) } })} /></label>
              <div className="card-settings-grid">
                <label>締め日<input type="number" min="1" max="31" value={draft.creditCard.closingDay} onChange={(event) => setDraft({ ...draft, creditCard: { ...draft.creditCard!, closingDay: Number(event.target.value) } })} /></label>
                <label>引落日<input type="number" min="1" max="31" value={draft.creditCard.paymentDay} onChange={(event) => setDraft({ ...draft, creditCard: { ...draft.creditCard!, paymentDay: Number(event.target.value) } })} /></label>
                <label>引落月数<input type="number" min="0" max="2" value={draft.creditCard.paymentDelayMonths} onChange={(event) => setDraft({ ...draft, creditCard: { ...draft.creditCard!, paymentDelayMonths: Number(event.target.value) } })} /></label>
              </div>
              <label>既定引落元
                <select value={draft.creditCard.defaultPaymentAccountId ?? ""} onChange={(event) => setDraft({ ...draft, creditCard: { ...draft.creditCard!, defaultPaymentAccountId: event.target.value || undefined } })}>
                  <option value="">未設定</option>
                  {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            </fieldset>
          )}
          <div className="account-editor-actions"><button type="button" onClick={() => setDraft(null)}>取消</button><button type="button" onClick={save}>保存</button></div>
        </div>
      )}
    </section>
  );
};
