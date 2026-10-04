import type { Transaction } from "../types/Transaction";

type MoveLike = Pick<Transaction, "date" | "destinationDate">;

/** Moveの移動元から出る日。 */
export const moveSourceDate = (transaction: MoveLike) => transaction.date;

/** Moveの移動先へ入る日。既存データは移動元日と同日として扱う。 */
export const moveDestinationDate = (transaction: MoveLike) =>
  transaction.destinationDate ?? transaction.date;

export const isMoveInTransitAsOf = (transaction: MoveLike, asOf: string) =>
  moveSourceDate(transaction) <= asOf && moveDestinationDate(transaction) > asOf;
