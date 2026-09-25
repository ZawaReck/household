import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import type { AccountActualState } from "../data/accountActualStore";
import { monthEndISO } from "./analytics";
import { accountBalanceAsOf } from "./accountBalances";
import { localDateISO } from "./date";
import { stableTransactions } from "./stableTransactions";

const adjustment = (account: string, month: string, basisDate: string, net: number): Transaction => ({
  id: `adj_${month}_${account}`,
  type: net > 0 ? "income" : "expense",
  amount: Math.abs(net),
  date: monthEndISO(month),
  name: "不明金",
  category: "その他",
  source: account,
  destination: "",
  memo: "実残高照合による自動調整",
  isSpecial: false,
  classification: "normal",
  system: { kind: "monthly_adjustment", key: `${month}:${account}`, basisDate },
});

export const reconcileMonthlyAdjustments = (
  transactions: Transaction[],
  accounts: Account[],
  state: AccountActualState,
  currentMonthKey = localDateISO().slice(0, 7),
) => {
  const regularAccounts = accounts.filter((account) => account.kind !== "credit_card" && account.kind !== "investment");
  const regularNames = regularAccounts.map((account) => account.name);
  const knownNames = new Set(regularNames);
  const withBasisDates = transactions.map((transaction) => {
    if (transaction.system?.kind !== "monthly_adjustment" || transaction.system.basisDate) return transaction;
    const month = transaction.date.slice(0, 7);
    const basisDate = state.basisDateByMonth[month];
    return basisDate ? { ...transaction, system: { ...transaction.system, basisDate } } : transaction;
  });
  const rebuilt = withBasisDates.filter((transaction) =>
    transaction.system?.kind !== "monthly_adjustment" ||
    !knownNames.has(transaction.source) ||
    transaction.date.slice(0, 7) >= currentMonthKey
  );

  Object.keys(state.byMonth).filter((month) => month < currentMonthKey).sort().forEach((month) => {
    const basisDate = state.basisDateByMonth[month] ?? monthEndISO(month);
    const actuals = state.byMonth[month] ?? {};
    const confirmed = new Set(state.confirmedByMonth[month] ?? []);
    regularAccounts.forEach((account) => {
      if (!confirmed.has(account.name) || account.openingDate > basisDate || actuals[account.name] == null) return;
      const net = Number(actuals[account.name]) - accountBalanceAsOf(account, rebuilt, basisDate);
      if (net !== 0) rebuilt.push(adjustment(account.name, month, basisDate, net));
    });
  });
  return stableTransactions(transactions, rebuilt);
};
