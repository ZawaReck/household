export type AccountKind = "cash" | "bank" | "electronic_money" | "investment" | "credit_card";

export type CreditCardSettings = {
  limit: number;
  closingDay: number;
  paymentDay: number;
  paymentDelayMonths: number;
  defaultPaymentAccountId?: string;
};

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  openingDate: string;
  isActive: boolean;
  creditCard?: CreditCardSettings;
  createdAt: string;
  updatedAt: string;
};

export const isCreditCard = (account: Account) => account.kind === "credit_card";
export const isInvestmentAccount = (account: Account) => account.kind === "investment";
