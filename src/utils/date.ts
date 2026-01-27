/* src/utils/date.ts */

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number) => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
};

export const formatISODate = ({ year, month, day }: DateParts) => {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseISODate = (value: string): DateParts | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { year: y, month: m, day: d };
};

export const isValidDateParts = (parts: DateParts, minYear: number, maxYear: number) => {
  if (parts.year < minYear || parts.year > maxYear) return false;
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1) return false;
  const maxDay = daysInMonth(parts.year, parts.month);
  return parts.day <= maxDay;
};

export const clampDay = (year: number, month: number, day: number) =>
  clamp(day, 1, daysInMonth(year, month));

export const getTodayParts = (): DateParts => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
};

export const resolveYearRange = (
  minYear: number | undefined,
  maxYear: number | undefined,
  baseYear: number
) => {
  const min = minYear ?? baseYear - 100;
  const max = maxYear ?? baseYear + 20;
  if (min <= max) return { minYear: min, maxYear: max };
  return { minYear: max, maxYear: min };
};

export const toSafeDateParts = (
  value: string | undefined,
  minYear: number,
  maxYear: number
) => {
  const parsed = value ? parseISODate(value) : null;
  if (parsed && isValidDateParts(parsed, minYear, maxYear)) return parsed;

  const today = getTodayParts();
  if (isValidDateParts(today, minYear, maxYear)) return today;

  return { year: minYear, month: 1, day: 1 };
};
