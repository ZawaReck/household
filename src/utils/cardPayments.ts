import type { Account } from "../types/Account";
import type { Transaction } from "../types/Transaction";
import { isBusinessDay } from "@modelgeek/japanese-holidays";

const dateISO = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const toPaymentDate = (statementYear: number, statementMonth: number, delayMonths: number, day: number) => {
  const paymentMonthIndex = statementMonth - 1 + delayMonths;
  const year = statementYear + Math.floor(paymentMonthIndex / 12);
  const month = (paymentMonthIndex % 12) + 1;
  const date = new Date(year, month - 1, Math.min(day, daysInMonth(year, month)));
  while (!isBusinessDay(date)) date.setDate(date.getDate() + 1);
  return dateISO(date);
};

const statementMonthFor = (date: string, closingDay: number) => {
  const [year, month, day] = date.split("-").map(Number);
  if (day <= closingDay) return { year, month };
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
};

export const reconcileCardPayments = (transactions: Transaction[], accounts: Account[]) => {
  const cards = accounts.filter((account) => account.isActive && account.kind === "credit_card" && account.creditCard);
  const managedCardIds = new Set(cards.map((account) => account.id));
  const desired = new Map<string, Transaction>();

  for (const card of cards) {
    const settings = card.creditCard!;
    const paymentAccount = accounts.find((account) => account.id === settings.defaultPaymentAccountId && account.isActive);
    if (!paymentAccount) continue;

    const buckets = new Map<string, { amount: number; statementYear: number; statementMonth: number; paymentDay: number; paymentDelayMonths: number }>();
    for (const transaction of transactions) {
      if (transaction.type !== "expense" || transaction.source !== card.name || transaction.system) continue;
      const cycle = transaction.cardCycle?.cardAccountId === card.id ? transaction.cardCycle : {
        cardAccountId: card.id,
        closingDay: settings.closingDay,
        paymentDay: settings.paymentDay,
        paymentDelayMonths: settings.paymentDelayMonths,
      };
      const statement = statementMonthFor(transaction.date, cycle.closingDay);
      const cycleKey = `${cycle.closingDay}-${cycle.paymentDay}-${cycle.paymentDelayMonths}`;
      const key = `${card.id}:${cycleKey}:${statement.year}-${String(statement.month).padStart(2, "0")}`;
      const bucket = buckets.get(key) ?? { amount: 0, statementYear: statement.year, statementMonth: statement.month, paymentDay: cycle.paymentDay, paymentDelayMonths: cycle.paymentDelayMonths };
      bucket.amount += transaction.amount;
      buckets.set(key, bucket);
    }

    for (const [key, bucket] of buckets) {
      if (bucket.amount <= 0) continue;
      const id = `card-payment:${key}`;
      desired.set(id, {
        id,
        type: "move",
        amount: bucket.amount,
        date: toPaymentDate(bucket.statementYear, bucket.statementMonth, bucket.paymentDelayMonths, bucket.paymentDay),
        name: `${card.name} 引落`,
        category: "move",
        source: paymentAccount.name,
        destination: card.name,
        memo: "",
        isSpecial: false,
        classification: "normal",
        system: { kind: "card_payment", key, cardAccountId: card.id },
      });
    }
  }

  const manualAndHistorical = transactions.filter((transaction) =>
    transaction.system?.kind !== "card_payment" ||
    !transaction.system.cardAccountId ||
    !managedCardIds.has(transaction.system.cardAccountId)
  );
  const existing = new Map(
    transactions
      .filter((transaction) => transaction.system?.kind === "card_payment")
      .map((transaction) => [transaction.id, transaction])
  );
  const today = dateISO(new Date());
  const generated = Array.from(desired.values()).map((next) => {
    const current = existing.get(next.id);
    if (!current) return next;
    const alreadyPaid = current.date <= today;
    return {
      ...next,
      date: current.system?.manualDate || alreadyPaid ? current.date : next.date,
      source: current.system?.manualSource || alreadyPaid ? current.source : next.source,
      system: { ...next.system!, manualDate: current.system?.manualDate, manualSource: current.system?.manualSource },
    };
  });
  return [...manualAndHistorical, ...generated];
};
