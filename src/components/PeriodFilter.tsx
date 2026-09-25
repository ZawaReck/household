/* src/components/PeriodFilter.tsx */

import React from "react";
import { useSegmentedDrag } from "../hooks/useSegmentedDrag";

export type PeriodPreset = "3" | "6" | "12" | "24" | "custom";

export interface PeriodValue {
  preset: PeriodPreset;
  startMonthKey: string;
  endMonthKey: string;
}

interface Props {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
}

export const PeriodFilter: React.FC<Props> = ({ value, onChange }) => {
  const presets: PeriodPreset[] = ["3", "6", "12", "24", "custom"];
  const presetDrag = useSegmentedDrag<HTMLDivElement>({
    count: presets.length,
    selectedIndex: Math.max(0, presets.indexOf(value.preset)),
    onSelect: (index) => onChange({ ...value, preset: presets[index] ?? "12" }),
    cssVariable: "--segment-position",
    horizontalPadding: 3,
  });
  const handlePreset = (preset: PeriodPreset) => {
    onChange({ ...value, preset });
  };

  const handleStart = (startMonthKey: string) => {
    const endMonthKey =
      startMonthKey > value.endMonthKey ? startMonthKey : value.endMonthKey;
    onChange({ ...value, preset: "custom", startMonthKey, endMonthKey });
  };

  const handleEnd = (endMonthKey: string) => {
    const startMonthKey =
      endMonthKey < value.startMonthKey ? endMonthKey : value.startMonthKey;
    onChange({ ...value, preset: "custom", startMonthKey, endMonthKey });
  };

  return (
    <div className="period-filter">
      <div
        ref={presetDrag.ref}
        className={`app-segmented-control period-buttons${presetDrag.isDragging ? " is-dragging" : ""}`}
        style={{ "--segment-count": presets.length, "--segment-index": Math.max(0, presets.indexOf(value.preset)) } as React.CSSProperties}
        {...presetDrag.handlers}
      >
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={value.preset === preset ? "active" : ""}
            onClick={() => handlePreset(preset)}
          >
            {preset === "custom" ? "指定" : preset === "12" ? "1年" : preset === "24" ? "2年" : `${preset}月`}
          </button>
        ))}
      </div>
      {value.preset === "custom" && <div className="period-custom">
        <label>
          開始月
          <input
            type="month"
            value={value.startMonthKey}
            onChange={(e) => handleStart(e.target.value)}
          />
        </label>
        <label>
          終了月
          <input
            type="month"
            value={value.endMonthKey}
            onChange={(e) => handleEnd(e.target.value)}
          />
        </label>
      </div>}
    </div>
  );
};
