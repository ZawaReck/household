import { describe, it, expect } from "vitest";
import {
  boundedChartScrollLeft,
  formatInvestmentChartDate,
  investmentChartDomain,
  investmentChartTimestamp,
  investmentPeriodStartDate,
  visibleChartRange,
} from "../src/utils/chartDisplay";

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
  it("uses actual elapsed days for investment chart positions, including a month boundary", () => {
    const april1 = investmentChartTimestamp("2026-04-01");
    const april3 = investmentChartTimestamp("2026-04-03");
    const april15 = investmentChartTimestamp("2026-04-15");
    const may1 = investmentChartTimestamp("2026-05-01");
    expect(april15 - april3).toBe((april3 - april1) * 6);
    expect(may1 - april15).toBe(16 * 24 * 60 * 60 * 1000);
    expect(formatInvestmentChartDate(may1)).toBe("05/01");
  });
  it("gives single and same-day investment points a safe time domain", () => {
    const point = investmentChartTimestamp("2026-01-01");
    expect(investmentChartDomain([point])).toEqual([
      point - 24 * 60 * 60 * 1000,
      point + 24 * 60 * 60 * 1000,
    ]);
    expect(investmentChartDomain([point, point])).toEqual(investmentChartDomain([point]));
    expect(investmentChartDomain([])).toEqual([0, 24 * 60 * 60 * 1000]);
  });
});
