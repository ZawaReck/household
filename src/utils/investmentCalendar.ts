import type { Account } from "../types/Account";
import type { InvestmentSnapshot } from "../types/Investment";
import type { Transaction } from "../types/Transaction";
import { investmentBalanceAsOf } from "./accountBalances";
import { monthEndISO } from "./analytics";

const previousMonthEndISO = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const investmentProfitForMonth = (
  accounts: Account[],
  transactions: Transaction[],
  snapshots: InvestmentSnapshot[],
  monthKey: string,
  asOf = monthEndISO(monthKey),
) => {
  const previousMonthEnd = previousMonthEndISO(monthKey);
  return accounts
    .filter((account) =>
      account.kind === "investment" &&
      account.openingDate <= asOf &&
      (account.isActive || !account.disabledAt || account.disabledAt > previousMonthEnd)
    )
    .reduce((total, account) => {
      const openedThisMonth = account.openingDate > previousMonthEnd;
      const flowStart = openedThisMonth ? account.openingDate : previousMonthEnd;
      const openingValue = openedThisMonth
        ? account.openingBalance
        : investmentBalanceAsOf(account, transactions, snapshots, previousMonthEnd);
      const closingValue = investmentBalanceAsOf(account, transactions, snapshots, asOf);
      let deposits = 0;
      let withdrawals = 0;
      transactions.forEach((transaction) => {
        if (transaction.type !== "move" || transaction.date <= flowStart || transaction.date > asOf) return;
        if (transaction.destination === account.name) deposits += transaction.amount;
        if (transaction.source === account.name) withdrawals += transaction.amount;
      });
      return total + closingValue + withdrawals - openingValue - deposits;
    }, 0);
};

export const buildInvestmentProfitCalendarEntry = (
  accounts: Account[],
  transactions: Transaction[],
  snapshots: InvestmentSnapshot[],
  monthKey: string,
  asOf = monthEndISO(monthKey),
): Transaction | null => {
  const hasEvaluationInMonth = snapshots.some((snapshot) =>
    snapshot.date.startsWith(`${monthKey}-`) &&
    snapshot.date <= asOf &&
    accounts.some((account) => account.kind === "investment" && snapshot.values[account.id] != null)
  );
  if (!hasEvaluationInMonth) return null;

  const profit = investmentProfitForMonth(accounts, transactions, snapshots, monthKey, asOf);
  return {
    id: `investment-profit:${monthKey}`,
    type: profit >= 0 ? "income" : "expense",
    amount: Math.abs(profit),
    date: monthEndISO(monthKey),
    name: "投資損益",
    category: "投資",
    source: "",
    destination: "",
    memo: `${asOf}時点の評価額と入出金から自動計算`,
    isSpecial: true,
    classification: "special",
    system: { kind: "investment_profit", key: monthKey },
  };
};
