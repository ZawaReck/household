import React from "react";
import { Link } from "react-router-dom";
import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { loadAccountActualState } from "../data/accountActualStore";
import { loadInvestmentState } from "../data/investmentStore";
import "./MonthEndReminder.css";

type Props = { accounts: Account[]; transactions: Transaction[] };

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthEnd = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
};

export const MonthEndReminder: React.FC<Props> = ({ accounts, transactions }) => {
  const now = new Date();
  const todayIsMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const targetDate = todayIsMonthEnd ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const targetMonth = monthKey(targetDate);
  const targetMonthEnd = monthEnd(targetMonth);
  const actuals = loadAccountActualState();
  const investments = loadInvestmentState();
  const confirmed = new Set(actuals.confirmedByMonth[targetMonth] ?? []);
  const snapshot = investments.snapshots.find((item) => item.date === targetMonthEnd);

  const missing = accounts.filter((account) => account.isActive && account.openingDate <= targetMonthEnd).filter((account) => {
    if (account.kind === "investment") return snapshot?.values[account.id] == null;
    if (account.kind !== "credit_card") return !confirmed.has(account.name);
    const used = transactions.reduce((sum, transaction) => {
      if (transaction.date > targetMonthEnd) return sum;
      if (transaction.type === "expense" && !transaction.system && transaction.source === account.name) return sum + transaction.amount;
      if (transaction.type === "move" && transaction.destination === account.name && transaction.system?.kind === "card_payment") return sum - transaction.amount;
      return sum;
    }, 0);
    const available = (account.creditCard?.limit ?? 0) - used;
    return !confirmed.has(account.name) || actuals.byMonth[targetMonth]?.[account.name] !== available;
  });

  const [isPopupOpen, setIsPopupOpen] = React.useState(missing.length > 0);
  if (missing.length === 0) return null;

  return (
    <>
      <aside className="month-end-banner" role="status">
        <div><strong>{targetMonth} 月末更新が未完了です</strong><span>{missing.map((account) => account.name).join("、")}</span></div>
        <Link to="/graphs?tab=portfolio">更新する</Link>
      </aside>
      {isPopupOpen && (
        <div className="month-end-popup-backdrop">
          <section className="month-end-popup" role="dialog" aria-modal="true" aria-labelledby="month-end-popup-title">
            <h2 id="month-end-popup-title">月末更新が未完了です</h2>
            <p>{targetMonth} の残高確認が必要です。</p>
            <p className="month-end-popup-accounts">{missing.map((account) => account.name).join("、")}</p>
            <div><button type="button" onClick={() => setIsPopupOpen(false)}>あとで</button><Link to="/graphs?tab=portfolio">更新する</Link></div>
          </section>
        </div>
      )}
    </>
  );
};
