import type { ScheduledMove, ScheduledMoveRevision } from "../types/ScheduledMove";
import type { Transaction } from "../types/Transaction";

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (value: string) => new Date(`${value}T00:00:00`);
const addDays = (value: string, days: number) => { const date = parse(value); date.setDate(date.getDate() + days); return iso(date); };
const monthDays = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const isDue = (date: Date, revision: ScheduledMoveRevision) => {
  if (revision.frequency === "daily") return true;
  if (revision.frequency === "weekly") return date.getDay() === revision.executionDay;
  return date.getDate() === Math.min(revision.executionDay, monthDays(date));
};

const isActiveOn = (schedule: ScheduledMove, date: string) => schedule.activePeriods.some((period) =>
  period.start <= date && (!period.end || date <= period.end)
);

export const reconcileScheduledMoves = (
  transactions: Transaction[],
  schedules: ScheduledMove[],
  throughDate = iso(new Date())
) => {
  const existingIds = new Set(transactions.map(({ id }) => id));
  const additions: Transaction[] = [];

  schedules.forEach((schedule) => {
    const revisions = [...schedule.revisions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    revisions.forEach((revision, index) => {
      const nextRevision = revisions[index + 1];
      const rangeStart = revision.effectiveFrom > schedule.startDate ? revision.effectiveFrom : schedule.startDate;
      let rangeEnd = throughDate;
      if (revision.endDate && revision.endDate < rangeEnd) rangeEnd = revision.endDate;
      if (nextRevision) {
        const beforeNext = addDays(nextRevision.effectiveFrom, -1);
        if (beforeNext < rangeEnd) rangeEnd = beforeNext;
      }
      if (rangeStart > rangeEnd) return;

      for (let cursor = parse(rangeStart); iso(cursor) <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
        const executionDate = iso(cursor);
        if (!isActiveOn(schedule, executionDate) || !isDue(cursor, revision)) continue;
        if (schedule.skippedDates.includes(executionDate)) continue;
        const id = `scheduled-move:${schedule.id}:${executionDate}`;
        if (existingIds.has(id)) continue;
        additions.push({
          id,
          type: "move",
          amount: revision.amount,
          date: executionDate,
          name: revision.name,
          category: "move",
          source: revision.source,
          destination: revision.destination,
          memo: "",
          isSpecial: false,
          classification: "normal",
          system: { kind: "scheduled_move", key: `${schedule.id}:${executionDate}`, scheduleId: schedule.id },
        });
        existingIds.add(id);
      }
    });
  });

  return { transactions: additions.length ? [...transactions, ...additions] : transactions, generatedCount: additions.length };
};
