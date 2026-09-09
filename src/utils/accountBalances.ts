import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";

export const accountBalanceAsOf = (account: Account, transactions: Transaction[], asOf: string) => {
  return transactions
    .filter((transaction) => transaction.date > account.openingDate && transaction.date <= asOf)
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
      transaction.type === "expense" &&
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
