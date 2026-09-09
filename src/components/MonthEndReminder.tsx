import React from "react";
import { Link } from "react-router-dom";
import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { loadAccountActualState } from "../data/accountActualStore";
import { loadInvestmentState } from "../data/investmentStore";
import { creditCardOutstandingAsOf } from "../utils/accountBalances";
import "./MonthEndReminder.css";

type Props = { accounts: Account[]; transactions: Transaction[] };

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthEnd = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
};
const nextMonth = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  const next = new Date(year, month, 1);
  return monthKey(next);
};

export const MonthEndReminder: React.FC<Props> = ({ accounts, transactions }) => {
  const now = new Date();
  const todayIsMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const latestTargetDate = todayIsMonthEnd ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const latestTargetMonth = monthKey(latestTargetDate);
  const actuals = loadAccountActualState();
  const investments = loadInvestmentState();
  const openingMonths = accounts.map((account) => account.openingDate.slice(0, 7)).filter(Boolean).sort();
  let targetMonth = openingMonths[0] ?? latestTargetMonth;
  let missing: Account[] = [];
  while (targetMonth <= latestTargetMonth) {
    const targetMonthEnd = monthEnd(targetMonth);
    const confirmed = new Set(actuals.confirmedByMonth[targetMonth] ?? []);
    const snapshot = investments.snapshots.find((item) => item.date === targetMonthEnd);
    missing = accounts
      .filter((account) => account.openingDate <= targetMonthEnd && (account.isActive || Boolean(account.disabledAt && account.disabledAt > targetMonthEnd)))
      .filter((account) => {
        if (account.kind === "investment") return snapshot?.values[account.id] == null;
        if (account.kind !== "credit_card") return !confirmed.has(account.name);
        const used = creditCardOutstandingAsOf(account, transactions, targetMonthEnd);
        const limit = actuals.cardLimitByMonth[targetMonth]?.[account.name] ?? account.creditCard?.limit ?? 0;
        const available = limit - used;
        return !confirmed.has(account.name) || actuals.byMonth[targetMonth]?.[account.name] !== available;
      });
    if (missing.length > 0) break;
    targetMonth = nextMonth(targetMonth);
  }

  const [isPopupOpen, setIsPopupOpen] = React.useState(missing.length > 0);
  if (missing.length === 0) return null;

  return (
    <>
      <aside className="month-end-banner" role="status">
        <div><strong>{targetMonth} 月末更新が未完了です</strong><span>{missing.map((account) => account.name).join("、")}</span></div>
        <Link to={`/graphs?tab=portfolio&month=${targetMonth}`}>更新する</Link>
      </aside>
      {isPopupOpen && (
        <div className="month-end-popup-backdrop">
          <section className="month-end-popup" role="dialog" aria-modal="true" aria-labelledby="month-end-popup-title">
            <h2 id="month-end-popup-title">月末更新が未完了です</h2>
            <p>{targetMonth} の残高確認が必要です。</p>
            <p className="month-end-popup-accounts">{missing.map((account) => account.name).join("、")}</p>
            <div><button type="button" onClick={() => setIsPopupOpen(false)}>あとで</button><Link to={`/graphs?tab=portfolio&month=${targetMonth}`}>更新する</Link></div>
          </section>
        </div>
      )}
    </>
  );
};
