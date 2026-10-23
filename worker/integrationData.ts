import type { Account } from "../src/types/Account";
import type { InvestmentState } from "../src/types/Investment";
import type { Transaction } from "../src/types/Transaction";
import { expenseCategoryOptions, incomeCategoryOptions } from "../src/data/categoryOptions";
import { isIncludedInRegularAnalytics, sumExpenseByCategoryAllocatedTax, sumIncomeExpenseByMonth } from "../src/utils/analytics";
import {
  accountBalanceAsOf,
  calendarAssetBalanceAsOf,
  creditCardOutstandingAsOf,
  investmentBalanceAsOf,
} from "../src/utils/accountBalances";

export const integrationCalculationVersion = "household-integration-v1";
export const integrationCurrency = "JPY";
export const integrationTimeZone = "Asia/Tokyo";

export type IntegrationRecords = {
  transactions: Transaction[];
  accounts: Account[];
  investments: InvestmentState;
  dataUpdatedAt: string;
};

export type SummaryResponse = {
  currency: typeof integrationCurrency;
  timeZone: typeof integrationTimeZone;
  calculationVersion: typeof integrationCalculationVersion;
  generatedAt: string;
  dataUpdatedAt: string;
  period: {
    month: string;
    start: string;
    end: string;
    complete: boolean;
  };
  inclusion: {
    classifications: ["normal"];
    transactionTypes: ["income", "expense"];
    investmentProfit: false;
  };
  income: number;
  expense: number;
  net: number;
};

export type BalanceResponse = {
  currency: typeof integrationCurrency;
  timeZone: typeof integrationTimeZone;
  calculationVersion: typeof integrationCalculationVersion;
  generatedAt: string;
  dataUpdatedAt: string;
  asOf: string;
  breakdownAvailable: boolean;
  totalAssets: number;
  liquidAssets: number | null;
  creditCardOutstanding: number | null;
  accounts: Array<{
    id: string;
    name: string;
    kind: Account["kind"];
    balance: number | null;
    outstanding: number | null;
    includedInTotalAssets: boolean;
  }>;
};

export type IntegrationTransactionType = "expense" | "income";

export type CategoriesResponse = {
  currency: typeof integrationCurrency;
  timeZone: typeof integrationTimeZone;
  calculationVersion: typeof integrationCalculationVersion;
  generatedAt: string;
  dataUpdatedAt: string;
  period: SummaryResponse["period"];
  inclusion: {
    classifications: ["normal"];
    transactionType: IntegrationTransactionType;
    investmentProfit: false;
  };
  total: number;
  categories: Array<{
    name: string;
    total: number;
    transactionCount: number;
    transactions: Array<{
      id: string;
      date: string;
      name: string;
      amount: number;
      source: string;
      memo: string;
    }>;
  }>;
};

const lastDayOfMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
};

export const isValidMonth = (value: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
};

export const isValidDate = (value: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day && year >= 2000 && year <= 2100;
};

export const isValidTransactionType = (value: string): value is IntegrationTransactionType =>
  value === "expense" || value === "income";

export const jstDateISO = (now = new Date()) => new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const isVisibleAsOf = (account: Account, asOf: string) =>
  account.openingDate <= asOf && (account.isActive || Boolean(account.disabledAt && asOf < account.disabledAt));

const monthPeriod = (month: string, today: string) => {
  const monthEnd = lastDayOfMonth(month);
  const end = month === today.slice(0, 7) ? today : monthEnd;
  return { month, start: `${month}-01`, end, complete: end === monthEnd };
};

const sortByDefaultCategoryOrder = <T extends { name: string }>(items: T[], order: string[]) => {
  const indexes = new Map(order.map((name, index) => [name, index]));
  return [...items].sort((a, b) => {
    const aIndex = indexes.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = indexes.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.name.localeCompare(b.name, "ja");
  });
};

const transactionDisplayAmount = (transaction: Transaction) => {
  if (transaction.taxMode !== "exclusive") return transaction.amount;
  const rate = transaction.taxRate === 8 || transaction.taxRate === 10 ? transaction.taxRate : 0;
  return Math.floor(Number(transaction.taxBaseAmount ?? transaction.amount) * (1 + rate / 100));
};

export const buildSummaryResponse = (
  records: IntegrationRecords,
  month: string,
  today: string,
  generatedAt: string,
): SummaryResponse => {
  const period = monthPeriod(month, today);
  const transactions = records.transactions.filter((transaction) => transaction.date <= period.end);
  const totals = sumIncomeExpenseByMonth(transactions, [month])[0] ?? { income: 0, expense: 0, net: 0 };
  return {
    currency: integrationCurrency,
    timeZone: integrationTimeZone,
    calculationVersion: integrationCalculationVersion,
    generatedAt,
    dataUpdatedAt: records.dataUpdatedAt,
    period,
    inclusion: {
      classifications: ["normal"],
      transactionTypes: ["income", "expense"],
      investmentProfit: false,
    },
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
  };
};

export const buildCategoriesResponse = (
  records: IntegrationRecords,
  month: string,
  type: IntegrationTransactionType,
  today: string,
  generatedAt: string,
): CategoriesResponse => {
  const period = monthPeriod(month, today);
  const transactions = records.transactions
    .filter((transaction) =>
      transaction.date >= period.start &&
      transaction.date <= period.end &&
      transaction.type === type &&
      transaction.isTaxAdjustment !== true &&
      isIncludedInRegularAnalytics(transaction)
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const categoryTotals = type === "expense"
    ? new Map(sumExpenseByCategoryAllocatedTax(
        records.transactions.filter((transaction) => transaction.date <= period.end),
        month,
      ).map((item) => [item.category, item.value]))
    : transactions.reduce((totals, transaction) => {
        const category = transaction.category || "未分類";
        totals.set(category, (totals.get(category) ?? 0) + transaction.amount);
        return totals;
      }, new Map<string, number>());
  const detailsByCategory = transactions.reduce((details, transaction) => {
    const category = transaction.category || "未分類";
    const current = details.get(category) ?? [];
    current.push({
      id: transaction.id,
      date: transaction.date,
      name: transaction.name,
      amount: transactionDisplayAmount(transaction),
      source: transaction.source,
      memo: transaction.memo,
    });
    details.set(category, current);
    return details;
  }, new Map<string, CategoriesResponse["categories"][number]["transactions"]>());
  const categories = sortByDefaultCategoryOrder(
    Array.from(categoryTotals.entries())
      .filter(([, total]) => total !== 0)
      .map(([name, total]) => ({
        name,
        total,
        transactionCount: detailsByCategory.get(name)?.length ?? 0,
        transactions: detailsByCategory.get(name) ?? [],
      })),
    type === "expense" ? expenseCategoryOptions : incomeCategoryOptions,
  );
  return {
    currency: integrationCurrency,
    timeZone: integrationTimeZone,
    calculationVersion: integrationCalculationVersion,
    generatedAt,
    dataUpdatedAt: records.dataUpdatedAt,
    period,
    inclusion: {
      classifications: ["normal"],
      transactionType: type,
      investmentProfit: false,
    },
    total: categories.reduce((sum, category) => sum + category.total, 0),
    categories,
  };
};

export const buildBalanceResponse = (
  records: IntegrationRecords,
  asOf: string,
  generatedAt: string,
): BalanceResponse => {
  const operationStartDate = records.accounts
    .filter((account) => account.kind !== "credit_card")
    .map((account) => account.openingDate)
    .filter(Boolean)
    .sort()[0];
  const breakdownAvailable = !operationStartDate || asOf >= operationStartDate;
  const snapshots = records.investments.snapshots ?? [];
  const visibleAccounts = breakdownAvailable ? records.accounts.filter((account) => isVisibleAsOf(account, asOf)) : [];
  const accounts = visibleAccounts.map((account) => {
    if (account.kind === "credit_card") {
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance: null,
        outstanding: creditCardOutstandingAsOf(account, records.transactions, asOf),
        includedInTotalAssets: false,
      };
    }
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      balance: account.kind === "investment"
        ? investmentBalanceAsOf(account, records.transactions, snapshots, asOf)
        : accountBalanceAsOf(account, records.transactions, asOf),
      outstanding: null,
      includedInTotalAssets: true,
    };
  });
  const liquidKinds = new Set<Account["kind"]>(["cash", "bank", "electronic_money"]);
  const liquidAssets = breakdownAvailable
    ? accounts.reduce((total, account) => total + (liquidKinds.has(account.kind) ? account.balance ?? 0 : 0), 0)
    : null;
  const creditCardOutstanding = breakdownAvailable
    ? accounts.reduce((total, account) => total + (account.outstanding ?? 0), 0)
    : null;
  return {
    currency: integrationCurrency,
    timeZone: integrationTimeZone,
    calculationVersion: integrationCalculationVersion,
    generatedAt,
    dataUpdatedAt: records.dataUpdatedAt,
    asOf,
    breakdownAvailable,
    totalAssets: calendarAssetBalanceAsOf(records.accounts, records.transactions, snapshots, asOf),
    liquidAssets,
    creditCardOutstanding,
    accounts,
  };
};
