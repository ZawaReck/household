export const boundedChartScrollLeft = (scrollLeft: number, width: number, canvasWidth: number) =>
  Math.max(0, Math.min(scrollLeft, Math.max(0, canvasWidth - width)));

// Include partially visible slots at both edges of the scrolling plot.
export const visibleChartRange = (count: number, scrollLeft: number, width: number, canvasWidth: number) => {
  const slot = Math.max(1, (canvasWidth - 12) / Math.max(1, count));
  const boundedScrollLeft = boundedChartScrollLeft(scrollLeft, width, canvasWidth);
  return {
    start: Math.max(0, Math.min(count, Math.floor((boundedScrollLeft - 6) / slot))),
    end: Math.max(0, Math.min(count, Math.ceil((boundedScrollLeft + width - 6) / slot))),
  };
};

// Inclusive calendar months, anchored to the month the user is viewing.
export const investmentPeriodStartDate = (asOf: string, months: string) => {
  if (months === "all") return "";
  const [year, month] = asOf.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - Number(months), 1));
  return date.toISOString().slice(0, 10);
};

export const investmentPeriodSeries = <T extends { date: string }>(
  points: T[],
  startDate: string,
  endDate: string,
) => {
  const visible = [...points]
    .filter((point) => point.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (visible.length === 0) return [];

  const inPeriod = startDate
    ? visible.filter((point) => point.date >= startDate)
    : visible;
  if (startDate) {
    const previous = visible.filter((point) => point.date < startDate).at(-1);
    if (previous) inPeriod.unshift({ ...previous, date: startDate });
  }
  if (inPeriod.length === 0) return [];

  const latest = inPeriod[inPeriod.length - 1];
  if (latest.date < endDate) inPeriod.push({ ...latest, date: endDate });
  return inPeriod;
};
