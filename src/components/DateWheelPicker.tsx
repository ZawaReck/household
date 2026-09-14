/* src/components/DateWheelPicker.tsx */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./DateWheelPicker.css";
import { PickerPanel, SelectionWheel } from "./PickerPanel";
import {
  clampDay,
  daysInMonth,
  formatISODate,
  getTodayParts,
  resolveYearRange,
  toSafeDateParts,
} from "../utils/date";

type Props = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  className?: string;
};

export const DateWheelPicker: React.FC<Props> = ({
  value,
  defaultValue,
  onChange,
  minYear,
  maxYear,
  disabled,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const today = useMemo(() => getTodayParts(), []);
  const yearRange = resolveYearRange(minYear, maxYear, today.year);
  const safeFrom = useCallback((raw?: string) =>
    toSafeDateParts(raw, yearRange.minYear, yearRange.maxYear),
  [yearRange.minYear, yearRange.maxYear]);

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(() => safeFrom(value ?? defaultValue));

  useEffect(() => {
    if (!isControlled) return;
    const next = safeFrom(value);
    setInternal(next);
  }, [isControlled, safeFrom, value]);

  useEffect(() => {
    if (isControlled) return;
    const next = safeFrom(formatISODate(internal));
    const changed =
      next.year !== internal.year ||
      next.month !== internal.month ||
      next.day !== internal.day;
    if (changed) setInternal(next);
  }, [internal, isControlled, safeFrom]);

  const parts = isControlled ? safeFrom(value) : internal;
  const pad2 = (num: number) => String(num).padStart(2, "0");
  const displayValue =
    parts.year === today.year
      ? `${pad2(parts.month)}/${pad2(parts.day)}`
      : `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}`;

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yearRange.minYear; y <= yearRange.maxYear; y += 1) list.push(y);
    return list;
  }, [yearRange.minYear, yearRange.maxYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(() => {
    const count = daysInMonth(parts.year, parts.month);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [parts.year, parts.month]);

  const emitChange = (next: { year: number; month: number; day: number }) => {
    const nextValue = formatISODate(next);
    if (!isControlled) setInternal(next);
    if (onChange) onChange(nextValue);
  };

  const handleYearSelect = (index: number) => {
    const nextYear = years[index];
    const nextDay = clampDay(nextYear, parts.month, parts.day);
    emitChange({ year: nextYear, month: parts.month, day: nextDay });
  };

  const handleMonthSelect = (index: number) => {
    const nextMonth = months[index];
    const nextDay = clampDay(parts.year, nextMonth, parts.day);
    emitChange({ year: parts.year, month: nextMonth, day: nextDay });
  };

  const handleDaySelect = (index: number) => {
    const nextDay = days[index];
    emitChange({ year: parts.year, month: parts.month, day: nextDay });
  };

  const rootClass = `date-wheel-picker${disabled ? " is-disabled" : ""}${
    className ? ` ${className}` : ""
  }`;


  return (
    <div className={rootClass} aria-disabled={disabled ? "true" : "false"}>
      <button
        type="button"
        className="date-wheel-trigger"
        onClick={() => {
          if (disabled) return;
          setIsOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <span className="date-wheel-trigger-label">日付</span>
        <span className="date-wheel-trigger-value">{displayValue}</span>
      </button>

      {isOpen && (
        <PickerPanel title="日付選択" onClose={() => setIsOpen(false)}
          action={<button type="button" onClick={() => emitChange(safeFrom(formatISODate(getTodayParts())))}>今日</button>}>
          <div className="selection-wheel-columns">
            <SelectionWheel label="年" options={years.map((year) => `${year}年`)}
              selectedIndex={parts.year - yearRange.minYear} onSelect={handleYearSelect} />
            <SelectionWheel label="月" options={months.map((month) => `${month}月`)}
              selectedIndex={parts.month - 1} onSelect={handleMonthSelect} />
            <SelectionWheel label="日" options={days.map((day) => `${day}日`)}
              selectedIndex={parts.day - 1} onSelect={handleDaySelect} />
          </div>
        </PickerPanel>
      )}
    </div>
  );
};
