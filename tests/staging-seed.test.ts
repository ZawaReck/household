import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Account } from "../src/types/Account";
import type { InvestmentState } from "../src/types/Investment";
import type { ScheduledMove } from "../src/types/ScheduledMove";
import type { Transaction } from "../src/types/Transaction";
import type { AccountActualState } from "../src/data/accountActualStore";
import { parseBackup } from "../src/utils/backup";
import { calendarAssetBalanceAsOf, totalAssetBalanceAsOf } from "../src/utils/accountBalances";
import { reconcileCardPayments } from "../src/utils/cardPayments";
import { reconcileMonthlyAdjustments } from "../src/utils/monthlyAdjustments";
import { reconcileScheduledMoves } from "../src/utils/scheduledMoves";

const payload = parseBackup(readFileSync(new URL("../fixtures/staging-seed.json", import.meta.url), "utf8"));
const accounts = payload.data["accounts.v1"] as Account[];
const transactions = payload.data.transactions as Transaction[];
const investments = payload.data.investments as InvestmentState;
const actuals = payload.data.accountActualBalances as AccountActualState;
const schedules = payload.data["scheduledMoves.v1"] as ScheduledMove[];

describe("staging seed", () => {
  it("uses an isolated, complete set of synthetic account types", () => {
    expect(accounts.every((account) => account.name.startsWith("STG"))).toBe(true);
    expect(new Set(accounts.map((account) => account.kind))).toEqual(new Set([
      "cash",
      "bank",
      "electronic_money",
      "credit_card",
      "investment",
    ]));
    expect(totalAssetBalanceAsOf(accounts, transactions, investments.snapshots, "2026-09-23")).toBe(1_000_000);
  });

  it("covers pre-operation reconstruction and current balance calculation", () => {
    expect(calendarAssetBalanceAsOf(accounts, transactions, investments.snapshots, "2026-07-31")).toBe(538_000);
    expect(calendarAssetBalanceAsOf(accounts, transactions, investments.snapshots, "2026-08-31")).toBe(748_000);
    expect(totalAssetBalanceAsOf(accounts, transactions, investments.snapshots, "2026-09-26")).toBe(1_239_200);
  });

  it("produces scheduled moves, card payments, and past-month adjustments", () => {
    const scheduled = reconcileScheduledMoves(transactions, schedules, "2026-09-26");
    expect(scheduled.generatedCount).toBe(1);

    const withCardPayments = reconcileCardPayments(scheduled.transactions, accounts);
    expect(withCardPayments.filter((item) => item.system?.kind === "card_payment")).toHaveLength(2);

    const reconciled = reconcileMonthlyAdjustments(withCardPayments, accounts, actuals, "2026-10");
    expect(reconciled.filter((item) => item.system?.kind === "monthly_adjustment")).toHaveLength(2);
  });
});
