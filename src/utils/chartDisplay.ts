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
