import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import type { InvestmentSnapshot } from "../types/Investment";
import { isIncludedInRegularAnalytics } from "./analytics";

export const accountBalanceAsOf = (account: Account, transactions: Transaction[], asOf: string) => {
  if (asOf < account.openingDate) return 0;
  return transactions
    .filter((transaction) => {
      const effectiveDate = transaction.system?.kind === "monthly_adjustment"
        ? transaction.system.basisDate ?? transaction.date
        : transaction.date;
      return effectiveDate > account.openingDate && effectiveDate <= asOf;
    })
    .reduce((balance, transaction) => {
      if (transaction.type === "income" && transaction.source === account.name) return balance + transaction.amount;
      if (transaction.type === "expense" && transaction.source === account.name) return balance - transaction.amount;
      if (transaction.type === "move") {
        if (transaction.source === account.name) return balance - transaction.amount;
        if (transaction.destination === account.name) return balance + transaction.amount;
      }
      return balance;
    }, account.openingBalance);
};

const isAccountVisibleAsOf = (account: Account, asOf: string) =>
  account.openingDate <= asOf && (account.isActive || Boolean(account.disabledAt && asOf < account.disabledAt));

export const investmentBalanceAsOf = (
  account: Account,
  transactions: Transaction[],
  snapshots: InvestmentSnapshot[],
  asOf: string,
) => {
  if (!isAccountVisibleAsOf(account, asOf)) return 0;
  const snapshot = [...snapshots]
    .filter((item) => item.date <= asOf && item.values[account.id] != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const basisDate = snapshot?.date ?? account.openingDate;
  const basisValue = snapshot?.values[account.id] ?? account.openingBalance;
  return transactions.reduce((balance, transaction) => {
    if (transaction.type !== "move" || transaction.date <= basisDate || transaction.date > asOf) return balance;
    if (transaction.destination === account.name) return balance + transaction.amount;
    if (transaction.source === account.name) return balance - transaction.amount;
    return balance;
  }, basisValue);
};

export const totalAssetBalanceAsOf = (
  accounts: Account[],
  transactions: Transaction[],
  snapshots: InvestmentSnapshot[],
  asOf: string,
) => accounts.reduce((total, account) => {
  if (!isAccountVisibleAsOf(account, asOf) || account.kind === "credit_card") return total;
  if (account.kind === "investment") return total + investmentBalanceAsOf(account, transactions, snapshots, asOf);
  return total + accountBalanceAsOf(account, transactions, asOf);
}, 0);

/**
 * カレンダー用総資産。運用開始前は開始日時点の総資産を基準に、
 * カレンダーの月次収支と同じ対象取引を逆向きに適用して復元する。
 */
export const calendarAssetBalanceAsOf = (
  accounts: Account[],
  transactions: Transaction[],
  snapshots: InvestmentSnapshot[],
  asOf: string,
  includeExcluded = false,
) => {
  const operationStartDate = accounts
    .filter((account) => account.kind !== "credit_card")
    .map((account) => account.openingDate)
    .filter(Boolean)
    .sort()[0];
  if (!operationStartDate || asOf >= operationStartDate) {
    return totalAssetBalanceAsOf(accounts, transactions, snapshots, asOf);
  }

  const openingTotal = totalAssetBalanceAsOf(accounts, transactions, snapshots, operationStartDate);
  const netChangeAfter = transactions.reduce((total, transaction) => {
    if (
      transaction.date <= asOf ||
      transaction.date > operationStartDate ||
      !isIncludedInRegularAnalytics(transaction, includeExcluded)
    ) return total;
    if (transaction.type === "income") return total + transaction.amount;
    if (transaction.type === "expense") return total - transaction.amount;
    return total;
  }, 0);
  return openingTotal - netChangeAfter;
};

export const hasFutureAccountActivity = (account: Account, transactions: Transaction[], today: string) =>
  transactions.some(
    (transaction) =>
      transaction.date > today &&
      (transaction.source === account.name || transaction.destination === account.name)
  );

export const creditCardOutstandingAsOf = (account: Account, transactions: Transaction[], asOf: string) =>
  transactions.reduce((outstanding, transaction) => {
    if (transaction.date > asOf) return outstanding;
    if (
      (transaction.type === "expense" || transaction.type === "move") &&
      !transaction.system &&
      transaction.source === account.name &&
      (transaction.date > account.openingDate || transaction.cardCycle?.cardAccountId === account.id)
    ) {
      return outstanding + transaction.amount;
    }
    if (
      transaction.type === "move" &&
      transaction.destination === account.name &&
      transaction.system?.kind === "card_payment"
    ) {
      return outstanding - transaction.amount;
    }
    return outstanding;
  }, 0);

export const hasFutureAutomaticCardPayment = (account: Account, transactions: Transaction[], today: string) =>
  transactions.some((transaction) =>
    transaction.date > today &&
    transaction.type === "move" &&
    transaction.destination === account.name &&
    transaction.system?.kind === "card_payment"
  );
