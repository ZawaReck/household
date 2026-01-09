/* src/components/CalendarView.tsx */

import React from "react";
import type { Transaction } from "../types/Transaction";
import "./CalendarView.css";

interface CalendarViewProps {
	year: number;
	month: number;
	monthlyData: Transaction[];
	onMonthChange: (offset: number) => void;
  onDateClick: (dateStr: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ year, month, monthlyData, onMonthChange, onDateClick }) => {
	const firstDayOfMonth = new Date(year, month, 1);
	const start = new Date (year, month, 1 - firstDayOfMonth.getDay()); // 週の始まりの日曜日

	const lastDayOfMonth = new Date(year, month + 1, 0);
	const end = new Date(year, month + 1, 6 - lastDayOfMonth.getDay()); // 週の終わりの土曜日


	const calendarDays: Date[] = [];
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  calendarDays.push(new Date(d));
}

const weeksNeeded = calendarDays.length / 7; // 4,5,6 のどれかになる
const weeksToRender = weeksNeeded === 6 ? 6 : weeksNeeded === 4 ? 4 : 5;

	return (
		<div className="calendar-view">
			<div className="calendar-nav">
				<button onClick={() => onMonthChange(-1)}>◁</button>
				<span>{year}年 {month + 1}月</span>
				<button onClick={() => onMonthChange(1)}>▷</button>
			</div>
			<div className="calendar-weekdays">
      {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
        <div key={day} className="calendar-name">{day}</div>
      ))}
    </div>

    {/* 日付（ここが 4/5/6 行で伸縮） */}
    <div className="calendar-days" style={{ ["--weeks" as any]: weeksToRender }}>
      {calendarDays.map((date, index) => {
        const isCurrentMonth = date.getMonth() === month;

        // ここは「toISOString」ではなくローカル基準の文字列で（ズレ対策済みならそのままでOK）
        const dateStr = isCurrentMonth
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
          : null;

        const dayTransactions = isCurrentMonth ? monthlyData.filter(t => t.date === dateStr) : [];
        const income = dayTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
        const expense = dayTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

        return (
          <div key={index}
            className={`cell ${isCurrentMonth ? "" : "other-month"}`}
            onClick={() => {
              if (!dateStr) return;
              onDateClick(dateStr);
            }}
            style={{ cursor: isCurrentMonth ? "pointer" : "default" }}
          >

            <span className="date-num">{date.getDate()}</span>

            {/* 収入/支出の行を固定したい実装（あなたの今のgrid方式でOK） */}
            <div className="cell-amounts">
              <span className={`income ${income >= 1000000 ? "small-font" : ""}`}>
                {income > 0 ? income.toLocaleString() : "\u00A0"}
              </span>
              <span className={`expense ${expense >= 1000000 ? "small-font" : ""}`}>
                {expense > 0 ? expense.toLocaleString() : "\u00A0"}
              </span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}