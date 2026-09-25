import type { AccountActualState } from "../data/accountActualStore";
import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { creditCardOutstandingAsOf } from "./accountBalances";
import { monthEndISO } from "./analytics";

export const invalidateChangedCardConfirmations = (
  state: AccountActualState,
  accounts: Account[],
  transactions: Transaction[],
) => {
  let changed = false;
  const cardsByName = new Map(
    accounts
      .filter((account) => account.kind === "credit_card" && account.creditCard)
      .map((account) => [account.name, account]),
  );
  const confirmedByMonth = Object.fromEntries(
    Object.entries(state.confirmedByMonth).map(([month, names]) => {
      const asOf = monthEndISO(month);
      const retained = names.filter((name) => {
        const card = cardsByName.get(name);
        if (!card) return true;
        const applicableLimit = state.cardLimitByMonth[month]?.[name] ?? card.creditCard!.limit;
        const calculatedAvailable = applicableLimit - creditCardOutstandingAsOf(card, transactions, asOf);
        return state.byMonth[month]?.[name] === calculatedAvailable;
      });
      if (retained.length !== names.length) changed = true;
      return [month, retained];
    }),
  );
  return changed ? { ...state, confirmedByMonth } : state;
};
