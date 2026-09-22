import { describe, it, expect } from "vitest";
import { boundedChartScrollLeft, visibleChartRange, investmentPeriodStartDate, investmentPeriodSeries } from "../src/utils/chartDisplay";

describe("chart display boundaries", () => {
  it("includes a partially visible seventh month when scrolled between slots", () => {
    expect(visibleChartRange(12, 35, 307, 636)).toEqual({ start: 0, end: 7 });
    expect(visibleChartRange(12, 329, 307, 636)).toEqual({ start: 6, end: 12 });
  });
  it("keeps the visible range stable during elastic overscroll at both edges", () => {
    expect(boundedChartScrollLeft(-80, 307, 636)).toBe(0);
    expect(boundedChartScrollLeft(409, 307, 636)).toBe(329);
    expect(visibleChartRange(12, -80, 307, 636)).toEqual(visibleChartRange(12, 0, 307, 636));
    expect(visibleChartRange(12, 409, 307, 636)).toEqual(visibleChartRange(12, 329, 307, 636));
  });
  it("anchors inclusive calendar periods to the selected month across year boundaries", () => {
    expect(investmentPeriodStartDate("2026-09-30", "3")).toBe("2026-07-01");
    expect(investmentPeriodStartDate("2026-02-28", "3")).toBe("2025-12-01");
    expect(investmentPeriodStartDate("2026-09-30", "12")).toBe("2025-10-01");
    expect(investmentPeriodStartDate("2026-09-30", "all")).toBe("");
  });
  it("pins investment series to the selected period and carries the latest known value", () => {
    const points = [
      { date: "2026-06-15", value: 100 },
      { date: "2026-07-31", value: 110 },
      { date: "2026-09-15", value: 130 },
      { date: "2026-10-01", value: 140 },
    ];
    expect(investmentPeriodSeries(points, "2026-07-01", "2026-09-30")).toEqual([
      { date: "2026-07-01", value: 100 },
      { date: "2026-07-31", value: 110 },
      { date: "2026-09-15", value: 130 },
      { date: "2026-09-30", value: 130 },
    ]);
  });
  it("uses the first record for all-time display and still pins the selected end date", () => {
    expect(investmentPeriodSeries(
      [{ date: "2025-01-31", value: 100 }, { date: "2025-04-30", value: 120 }],
      "",
      "2025-06-30",
    )).toEqual([
      { date: "2025-01-31", value: 100 },
      { date: "2025-04-30", value: 120 },
      { date: "2025-06-30", value: 120 },
    ]);
  });
});
