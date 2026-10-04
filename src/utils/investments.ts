import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { moveDestinationDate, moveSourceDate } from "./moveDates";

export type InvestmentFlows = {
  deposits: number;
  withdrawals: number;
  cumulativeDeposits: number;
  cumulativeWithdrawals: number;
};

export const investmentOpeningFlows = (account: Account) => ({
  deposits: account.initialDeposits ?? account.openingBalance - (account.initialProfit ?? 0),
  withdrawals: account.initialWithdrawals ?? 0,
});

export const investmentOpeningProfit = (account: Account) => {
  const opening = investmentOpeningFlows(account);
  return account.openingBalance + opening.withdrawals - opening.deposits;
};

export const investmentFlowsAsOf = (
  account: Account,
  transactions: Transaction[],
  date: string,
): InvestmentFlows => {
  if (date < account.openingDate) {
    return { deposits: 0, withdrawals: 0, cumulativeDeposits: 0, cumulativeWithdrawals: 0 };
  }

  let deposits = 0;
  let withdrawals = 0;
  transactions.forEach((transaction) => {
    if (transaction.type !== "move") return;
    const destinationDate = moveDestinationDate(transaction);
    const sourceDate = moveSourceDate(transaction);
    if (transaction.destination === account.name && destinationDate > account.openingDate && destinationDate <= date) deposits += transaction.amount;
    if (transaction.source === account.name && sourceDate > account.openingDate && sourceDate <= date) withdrawals += transaction.amount;
  });

  const opening = investmentOpeningFlows(account);
  return {
    deposits,
    withdrawals,
    cumulativeDeposits: opening.deposits + deposits,
    cumulativeWithdrawals: opening.withdrawals + withdrawals,
  };
};
