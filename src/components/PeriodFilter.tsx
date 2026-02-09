/* src/components/PeriodFilter.tsx */

import React from "react";

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
      <div className="period-buttons">
        {(["3", "6", "12", "24", "custom"] as PeriodPreset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            className={value.preset === preset ? "active" : ""}
            onClick={() => handlePreset(preset)}
          >
            {preset === "custom" ? "カスタム" : `${preset}ヶ月`}
          </button>
        ))}
      </div>
      <div className="period-custom">
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
      </div>
    </div>
  );
};
