import type { Transaction } from "../types/Transaction";

/** Keep surviving rows in their original positions; append only newly generated rows. */
export const stableTransactions = (previous: Transaction[], desired: Transaction[]) => {
  const remaining = new Map(desired.map((item) => [item.id, item]));
  const result: Transaction[] = [];
  for (const item of previous) {
    const next = remaining.get(item.id);
    if (!next) continue;
    remaining.delete(item.id);
    result.push(next === item || JSON.stringify(next) === JSON.stringify(item) ? item : next);
  }
  result.push(...remaining.values());
  return result.length === previous.length && result.every((item, index) => item === previous[index])
    ? previous
    : result;
};
