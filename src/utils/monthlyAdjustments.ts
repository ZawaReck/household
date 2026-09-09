import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import type { AccountActualState } from "../data/accountActualStore";
import { monthEndISO } from "./analytics";
import { accountBalanceAsOf } from "./accountBalances";

const adjustment = (account: string, month: string, net: number): Transaction => ({
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
  system: { kind: "monthly_adjustment", key: `${month}:${account}` },
});

export const reconcileMonthlyAdjustments = (
  transactions: Transaction[],
  accounts: Account[],
  state: AccountActualState
) => {
  const regularAccounts = accounts.filter((account) => account.kind !== "credit_card" && account.kind !== "investment");
  const regularNames = regularAccounts.map((account) => account.name);
  const knownNames = new Set(regularNames);
  const rebuilt = transactions.filter((transaction) =>
    transaction.system?.kind !== "monthly_adjustment" || !knownNames.has(transaction.source)
  );

  Object.keys(state.byMonth).sort().forEach((month) => {
    const basisDate = state.basisDateByMonth[month] ?? monthEndISO(month);
    const actuals = state.byMonth[month] ?? {};
    regularAccounts.forEach((account) => {
      if (account.openingDate > basisDate || actuals[account.name] == null) return;
      const net = Number(actuals[account.name]) - accountBalanceAsOf(account, rebuilt, basisDate);
      if (net !== 0) rebuilt.push(adjustment(account.name, month, net));
    });
  });
  return rebuilt;
};
