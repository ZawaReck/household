/* src/components/DateWheelPicker.tsx */

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./DateWheelPicker.css";
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

const ITEM_H = 40;
const VISIBLE = 5;
const PAD_ITEMS = Math.floor(VISIBLE / 2);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type ColumnProps = {
  label: string;
  items: number[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  disabled?: boolean;
};

const WheelColumn: React.FC<ColumnProps> = ({
  label,
  items,
  selectedIndex,
  onSelectIndex,
  disabled,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const ignoreScrollRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const [tempIndex, setTempIndex] = useState(selectedIndex);

  const scrollToIndex = (index: number, behavior: ScrollBehavior) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: index * ITEM_H, behavior });
  };

  useEffect(() => {
    setTempIndex(selectedIndex);
    const el = listRef.current;
    if (!el) return;
    ignoreScrollRef.current = true;
    scrollToIndex(selectedIndex, "auto");
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
  }, [selectedIndex, items.length]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const commitIndex = (index: number) => {
    const next = clamp(index, 0, items.length - 1);
    onSelectIndex(next);
    ignoreScrollRef.current = true;
    scrollToIndex(next, "auto");
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
  };

  const handleScroll = () => {
    if (disabled || ignoreScrollRef.current) return;
    const el = listRef.current;
    if (!el) return;
    const raw = Math.round(el.scrollTop / ITEM_H);
    const next = clamp(raw, 0, items.length - 1);
    setTempIndex(next);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      commitIndex(next);
    }, 120);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? -1 : 1;
    const next = clamp(tempIndex + delta, 0, items.length - 1);
    setTempIndex(next);
    scrollToIndex(next, "smooth");
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      commitIndex(next);
    }, 120);
  };

  return (
    <div className="date-wheel-column">
      <div
        ref={listRef}
        className="date-wheel-list"
        role="listbox"
        aria-label={label}
        aria-disabled={disabled ? "true" : "false"}
        tabIndex={disabled ? -1 : 0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        {Array.from({ length: PAD_ITEMS }).map((_, i) => (
          <div key={`pad-top-${label}-${i}`} className="date-wheel-item pad" style={{ height: ITEM_H }} />
        ))}
        {items.map((item, index) => (
          <div
            key={`${label}-${item}`}
            className={`date-wheel-item ${index === tempIndex ? "is-selected" : ""}`}
            style={{ height: ITEM_H }}
            role="option"
            aria-selected={index === selectedIndex}
            onClick={() => {
              if (disabled) return;
              scrollToIndex(index, "smooth");
            }}
          >
            {item}
          </div>
        ))}
        {Array.from({ length: PAD_ITEMS }).map((_, i) => (
          <div key={`pad-bot-${label}-${i}`} className="date-wheel-item pad" style={{ height: ITEM_H }} />
        ))}
      </div>
    </div>
  );
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const today = useMemo(() => getTodayParts(), []);
  const yearRange = resolveYearRange(minYear, maxYear, today.year);
  const safeFrom = (raw?: string) =>
    toSafeDateParts(raw, yearRange.minYear, yearRange.maxYear);

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(() => safeFrom(value ?? defaultValue));

  useEffect(() => {
    if (!isControlled) return;
    const next = safeFrom(value);
    setInternal(next);
  }, [isControlled, value, yearRange.minYear, yearRange.maxYear]);

  useEffect(() => {
    if (isControlled) return;
    const next = safeFrom(formatISODate(internal));
    const changed =
      next.year !== internal.year ||
      next.month !== internal.month ||
      next.day !== internal.day;
    if (changed) setInternal(next);
  }, [isControlled, yearRange.minYear, yearRange.maxYear]);

  const parts = isControlled ? safeFrom(value) : internal;
  const displayValue = formatISODate(parts);

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

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={rootClass} aria-disabled={disabled ? "true" : "false"}>
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
        {displayValue}
      </button>

      {isOpen && (
        <div
          className="date-wheel-popover"
          role="dialog"
          aria-label="日付選択"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="date-wheel-label-row">
            <div className="date-wheel-label">年</div>
            <div className="date-wheel-label">月</div>
            <div className="date-wheel-label">日</div>
          </div>
          <div className="date-wheel-body" style={{ height: ITEM_H * VISIBLE }}>
            <div className="date-wheel-highlight" style={{ height: ITEM_H }} />
            <WheelColumn
              label="年"
              items={years}
              selectedIndex={parts.year - yearRange.minYear}
              onSelectIndex={handleYearSelect}
              disabled={disabled}
            />
            <WheelColumn
              label="月"
              items={months}
              selectedIndex={parts.month - 1}
              onSelectIndex={handleMonthSelect}
              disabled={disabled}
            />
            <WheelColumn
              label="日"
              items={days}
              selectedIndex={parts.day - 1}
              onSelectIndex={handleDaySelect}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
};
