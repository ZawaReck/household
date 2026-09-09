import type { Account, AccountKind } from "../types/Account";
import { safeLoadJSON, safeSaveJSON } from "./storage";
import { localDateISO } from "../utils/date";

const STORAGE_KEY = "accounts.v1";
const todayISO = () => localDateISO();

type Seed = { id: string; name: string; kind: AccountKind; creditCard?: boolean };

const seeds: Seed[] = [
  { id: "wallet", name: "財布", kind: "cash" },
  { id: "paypay", name: "PayPay", kind: "electronic_money" },
  { id: "paypay-card", name: "PayPayクレカ", kind: "credit_card", creditCard: true },
  { id: "suica", name: "Suica", kind: "electronic_money" },
  { id: "olive-card", name: "oliveクレカ", kind: "credit_card", creditCard: true },
  { id: "paypay-bank", name: "PayPay銀行", kind: "bank" },
  { id: "jp-bank", name: "ゆうちょ銀行", kind: "bank" },
  { id: "nisa", name: "NISA口座", kind: "investment" },
  { id: "taxable", name: "特定口座", kind: "investment" },
  { id: "crypto", name: "暗号資産", kind: "investment" },
];

export const createDefaultAccounts = (date = todayISO()): Account[] =>
  seeds.map((seed) => ({
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    openingBalance: 0,
    openingDate: date,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(seed.creditCard
      ? {
          creditCard: {
            limit: 0,
            closingDay: 31,
            paymentDay: 27,
            paymentDelayMonths: 1,
          },
        }
      : {}),
  }));

const isAccount = (value: unknown): value is Account => {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<Account>;
  return typeof account.id === "string" && typeof account.name === "string" && typeof account.kind === "string";
};

export const loadAccounts = (): Account[] => {
  const saved = safeLoadJSON<unknown>(STORAGE_KEY, null);
  if (Array.isArray(saved) && saved.every(isAccount)) return saved;
  return createDefaultAccounts();
};

export const saveAccounts = (accounts: Account[]) => safeSaveJSON(STORAGE_KEY, accounts);

export const activeAccounts = (accounts: Account[]) => accounts.filter((account) => account.isActive);
