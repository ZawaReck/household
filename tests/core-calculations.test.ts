import { describe, expect, it } from "vitest";
import type { Account } from "../src/types/Account";
import type { ScheduledMove } from "../src/types/ScheduledMove";
import type { Transaction } from "../src/types/Transaction";
import { sumExpenseByCategoryAllocatedTax, sumIncomeExpenseByMonth } from "../src/utils/analytics";
import { reconcileCardPayments } from "../src/utils/cardPayments";
import { reconcileMonthlyAdjustments } from "../src/utils/monthlyAdjustments";
import { reconcileScheduledMoves } from "../src/utils/scheduledMoves";
import { reconcileReceiptTaxAdjustments } from "../src/utils/receiptTaxes";
import { mergeValues } from "../src/utils/backup";
import { applyDeletionTombstones } from "../src/data/deletionStore";
import { invalidateChangedCardConfirmations } from "../src/utils/cardConfirmations";
import { importHouseholdCsv } from "../src/utils/csvImport";

const transaction = (partial: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount" | "date">): Transaction => ({
  name: "test",
  category: partial.type === "move" ? "move" : "その他",
  source: "財布",
  destination: "",
  memo: "",
  isSpecial: false,
  classification: "normal",
  ...partial,
});

const account = (partial: Partial<Account> & Pick<Account, "id" | "name" | "kind">): Account => ({
  openingBalance: 0,
  openingDate: "2026-01-01",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...partial,
});

describe("analytics", () => {
  it("rounds external tax after summing each category and tax rate", () => {
    const items = [
      transaction({ id: "a", type: "expense", amount: 5, date: "2026-09-01", category: "食費", groupId: "g", taxMode: "exclusive", taxRate: 10, taxBaseAmount: 5 }),
      transaction({ id: "b", type: "expense", amount: 5, date: "2026-09-01", category: "食費", groupId: "g", taxMode: "exclusive", taxRate: 10, taxBaseAmount: 5 }),
    ];
    expect(sumExpenseByCategoryAllocatedTax(items, "2026-09")).toEqual([{ category: "食費", value: 11 }]);
  });

  it("includes settled and special entries only when explicitly requested", () => {
    const items = [
      transaction({ id: "normal", type: "expense", amount: 100, date: "2026-09-01" }),
      transaction({ id: "settled", type: "expense", amount: 200, date: "2026-09-02", classification: "settled" }),
      transaction({ id: "special", type: "expense", amount: 300, date: "2026-09-03", classification: "special" }),
    ];
    expect(sumIncomeExpenseByMonth(items, ["2026-09"])[0].expense).toBe(100);
    expect(sumIncomeExpenseByMonth(items, ["2026-09"], true)[0].expense).toBe(600);
  });
});

describe("receipt tax reconciliation", () => {
  it("rebuilds tax from the remaining receipt items and is idempotent", () => {
    const items = [
      transaction({ id: "a", type: "expense", amount: 100, date: "2026-09-01", groupId: "g", taxMode: "exclusive", taxRate: 8, taxBaseAmount: 100 }),
      transaction({ id: "b", type: "expense", amount: 100, date: "2026-09-01", groupId: "g", taxMode: "exclusive", taxRate: 10, taxBaseAmount: 100 }),
    ];
    const reconciled = reconcileReceiptTaxAdjustments(items);
    expect(reconciled.find((item) => item.isTaxAdjustment)).toMatchObject({ id: "tax-adjustment:g", amount: 18 });
    expect(reconcileReceiptTaxAdjustments(reconciled)).toEqual(reconciled);

    const afterDelete = reconcileReceiptTaxAdjustments(reconciled.filter((item) => item.id !== "b"));
    expect(afterDelete.find((item) => item.isTaxAdjustment)?.amount).toBe(8);
  });
});

describe("automatic moves", () => {
  it("reconciles card payments idempotently using the captured billing cycle", () => {
    const bank = account({ id: "bank", name: "銀行", kind: "bank" });
    const card = account({
      id: "card",
      name: "カード",
      kind: "credit_card",
      creditCard: { limit: 100_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1, defaultPaymentAccountId: "bank" },
    });
    const use = transaction({
      id: "use",
      type: "expense",
      amount: 1_000,
      date: "2026-01-15",
      source: "カード",
      cardCycle: { cardAccountId: "card", closingDay: 31, paymentDay: 27, paymentDelayMonths: 1 },
    });
    const first = reconcileCardPayments([use], [bank, card]);
    const payment = first.find((item) => item.system?.kind === "card_payment");
    expect(payment).toMatchObject({ amount: 1_000, date: "2026-02-27", source: "銀行", destination: "カード" });
    expect(reconcileCardPayments(first, [bank, card])).toEqual(first);
  });

  it("keeps historical card payments after the card is disabled", () => {
    const bank = account({ id: "bank", name: "銀行", kind: "bank" });
    const card = account({
      id: "card",
      name: "カード",
      kind: "credit_card",
      isActive: false,
      disabledAt: "2026-03-01",
      creditCard: { limit: 100_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1, defaultPaymentAccountId: "bank" },
    });
    const historicalPayment = transaction({
      id: "card-payment:card:31-27-1:2026-01",
      type: "move",
      amount: 1_000,
      date: "2026-02-27",
      source: "銀行",
      destination: "カード",
      system: { kind: "card_payment", key: "card:31-27-1:2026-01", cardAccountId: "card" },
    });

    expect(reconcileCardPayments([historicalPayment], [bank, card])).toEqual([historicalPayment]);
  });

  it("keeps historical card payments if the configured payment account is unavailable", () => {
    const disabledBank = account({ id: "bank", name: "銀行", kind: "bank", isActive: false, disabledAt: "2026-03-01" });
    const card = account({
      id: "card",
      name: "カード",
      kind: "credit_card",
      creditCard: { limit: 100_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1, defaultPaymentAccountId: "bank" },
    });
    const historicalPayment = transaction({
      id: "card-payment:card:31-27-1:2026-01",
      type: "move",
      amount: 1_000,
      date: "2026-02-27",
      source: "銀行",
      destination: "カード",
      system: { kind: "card_payment", key: "card:31-27-1:2026-01", cardAccountId: "card" },
    });

    expect(reconcileCardPayments([historicalPayment], [disabledBank, card])).toEqual([historicalPayment]);
  });

  it("invalidates a card confirmation when the calculated available amount changes", () => {
    const card = account({
      id: "card",
      name: "カード",
      kind: "credit_card",
      creditCard: { limit: 100_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1, defaultPaymentAccountId: "bank" },
    });
    const state = {
      byMonth: { "2026-01": { カード: 99_000 } },
      confirmedByMonth: { "2026-01": ["カード"] },
      basisDateByMonth: {},
      cardLimitByMonth: { "2026-01": { カード: 100_000 } },
    };
    const changedUse = transaction({ id: "use", type: "expense", amount: 2_000, date: "2026-01-20", source: "カード" });

    expect(invalidateChangedCardConfirmations(state, [card], [changedUse]).confirmedByMonth["2026-01"]).toEqual([]);
  });

  it("uses the limit captured at confirmation instead of rewriting history after a limit change", () => {
    const card = account({
      id: "card",
      name: "カード",
      kind: "credit_card",
      creditCard: { limit: 200_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1, defaultPaymentAccountId: "bank" },
    });
    const state = {
      byMonth: { "2026-01": { カード: 99_000 } },
      confirmedByMonth: { "2026-01": ["カード"] },
      basisDateByMonth: {},
      cardLimitByMonth: { "2026-01": { カード: 100_000 } },
    };
    const originalUse = transaction({ id: "use", type: "expense", amount: 1_000, date: "2026-01-20", source: "カード" });

    expect(invalidateChangedCardConfirmations(state, [card], [originalUse])).toBe(state);
  });

  it("generates each scheduled occurrence once and clamps a monthly day to month end", () => {
    const schedule: ScheduledMove = {
      id: "saving",
      startDate: "2026-01-01",
      isActive: true,
      activePeriods: [{ start: "2026-01-01" }],
      revisions: [{ effectiveFrom: "2026-01-01", source: "銀行", destination: "証券", amount: 10_000, name: "積立", frequency: "monthly", executionDay: 31 }],
      skippedDates: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const first = reconcileScheduledMoves([], [schedule], "2026-02-28");
    expect(first.transactions.map((item) => item.date)).toEqual(["2026-01-31", "2026-02-28"]);
    expect(reconcileScheduledMoves(first.transactions, [schedule], "2026-02-28").generatedCount).toBe(0);
  });
});

describe("month-end reconciliation", () => {
  it("rebuilds one deterministic adjustment after a past transaction changes", () => {
    const wallet = account({ id: "wallet", name: "財布", kind: "cash", openingBalance: 1_000 });
    const initial = transaction({ id: "expense", type: "expense", amount: 100, date: "2026-01-10" });
    const state = {
      byMonth: { "2026-01": { 財布: 850 } },
      confirmedByMonth: { "2026-01": ["財布"] },
      basisDateByMonth: { "2026-01": "2026-01-31" },
    };
    const first = reconcileMonthlyAdjustments([initial], [wallet], state);
    expect(first.find((item) => item.system?.kind === "monthly_adjustment")).toMatchObject({ type: "expense", amount: 50 });
    expect(reconcileMonthlyAdjustments(first, [wallet], state)).toEqual(first);

    const edited = first.map((item) => item.id === "expense" ? { ...item, amount: 200 } : item);
    const rebuilt = reconcileMonthlyAdjustments(edited, [wallet], state);
    expect(rebuilt.filter((item) => item.system?.kind === "monthly_adjustment")).toHaveLength(1);
    expect(rebuilt.find((item) => item.system?.kind === "monthly_adjustment")).toMatchObject({ type: "income", amount: 50 });
  });
});

describe("backup and sync merging", () => {
  it("merges monthly budgets by month and keeps the newer revision", () => {
    const current = {
      entries: [
        { month: "2026-08", byCategory: { 食費: 30_000 }, updatedAtISO: "2026-08-01T00:00:00.000Z" },
        { month: "2026-09", byCategory: { 食費: 35_000 }, updatedAtISO: "2026-09-01T00:00:00.000Z" },
      ],
    };
    const incoming = {
      entries: [
        { month: "2026-09", byCategory: { 食費: 40_000 }, updatedAtISO: "2026-09-02T00:00:00.000Z" },
        { month: "2026-10", byCategory: { 食費: 42_000 }, updatedAtISO: "2026-10-01T00:00:00.000Z" },
      ],
    };

    expect(mergeValues(current, incoming)).toEqual({
      entries: [
        current.entries[0],
        incoming.entries[0],
        incoming.entries[1],
      ],
    });
  });

  it("applies deletion tombstones to entries nested in a store object", () => {
    const value = { entries: [{ id: "keep", note: "残す" }, { id: "deleted", note: "削除" }] };
    expect(applyDeletionTombstones("sontokuEntries", value, {
      sontokuEntries: { deleted: "2026-09-10T00:00:00.000Z" },
    })).toEqual({ entries: [{ id: "keep", note: "残す" }] });
  });
});

describe("CSV import", () => {
  it("creates stable row IDs and maps known legacy categories", () => {
    const csv = "金額,日付,メモ,カテゴリ\n-1200,2026-09-01,書籍,趣味\n300000,2026-09-02,給与,月給";
    const first = importHouseholdCsv(csv);
    const second = importHouseholdCsv(csv);
    expect(first.invalidRows).toEqual([]);
    expect(first.transactions.map(({ id }) => id)).toEqual(second.transactions.map(({ id }) => id));
    expect(first.transactions).toMatchObject([
      { type: "expense", amount: 1200, name: "書籍", category: "趣味費", source: "" },
      { type: "income", amount: 300000, name: "給与", category: "月収", source: "" },
    ]);
  });

  it("requires explicit exclusion for zero and fractional yen rows", () => {
    const result = importHouseholdCsv("金額,日付,メモ,カテゴリ\n0,2026-09-01,zero,その他\n1.5,2026-09-02,fraction,その他");
    expect(result.transactions).toEqual([]);
    expect(result.invalidRows).toHaveLength(2);
  });
});
