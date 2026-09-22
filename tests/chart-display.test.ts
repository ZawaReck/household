import { describe, it, expect } from "vitest";
import { visibleChartRange, investmentPeriodStartDate } from "../src/utils/chartDisplay";

describe("chart display boundaries", () => {
  it("includes a partially visible seventh month when scrolled between slots", () => {
    expect(visibleChartRange(12, 35, 307, 636)).toEqual({ start: 0, end: 7 });
    expect(visibleChartRange(12, 329, 307, 636)).toEqual({ start: 6, end: 12 });
  });
  it("keeps the visible range stable during elastic overscroll at both edges", () => {
    expect(visibleChartRange(12, -80, 307, 636)).toEqual(visibleChartRange(12, 0, 307, 636));
    expect(visibleChartRange(12, 409, 307, 636)).toEqual(visibleChartRange(12, 329, 307, 636));
  });
  it("anchors inclusive calendar periods to the selected month across year boundaries", () => {
    expect(investmentPeriodStartDate("2026-09-30", "3")).toBe("2026-07-01");
    expect(investmentPeriodStartDate("2026-02-28", "3")).toBe("2025-12-01");
    expect(investmentPeriodStartDate("2026-09-30", "12")).toBe("2025-10-01");
    expect(investmentPeriodStartDate("2026-09-30", "all")).toBe("");
  });
});
