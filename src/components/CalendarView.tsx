import React from "react";
import type { Transaction } from "../types/Transaction";
import "./CalendarView.css";

interface CalendarViewProps {
	year: number;
	month: number;
	monthlyData: Transaction[];
	onMonthChange: (offset: number) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ year, month, monthlyData, onMonthChange }) => {
	const firstDayOfMonth = new Date(year, month, 1);
	const firstDateOfWeek = firstDayOfMonth.getDay();

	const calendarDays = [];

	for (let i = firstDateOfWeek; i > 0; i--) {
		calendarDays.push(new Date(year, month, 1 - i));
	}

	const daysInMonth = new Date(year, month + 1, 0).getDate();
	for (let i = 0; i <= daysInMonth; i++) {
		calendarDays.push(new Date(year, month, i));
	}

	const remainingDays = 42 - calendarDays.length;
	for (let i = 1; i <= remainingDays; i++) {
		calendarDays.push(new Date(year, month + 1, i));
	}

	return (
		<div className="calendar-view">
			<div className="calendar-nav">
				<button onClick={() => onMonthChange(-1)}>◁</button>
				<span>{year}年 {month + 1}月</span>
				<button onClick={() => onMonthChange(1)}>▷</button>
			</div>
			<div className="calendar-grid">
				{["日", "月", "火", "水", "木", "金", "土"].map((day) => (
					<div key={day} className="calendar-name">{day}</div>
				))}
				{calendarDays.map((date, index) => {
					const isCurrentMonth = date.getMonth() === month;
					const dateStr = isCurrentMonth ? date.toISOString().split('T')[0] : null;

					const dayTransactions = isCurrentMonth ? monthlyData.filter(t => t.date === dateStr) : [];
					const income = dayTransactions
						.filter(t => t.type === "income")
						.reduce((sum, t) => sum + t.amount, 0);
					const expense = dayTransactions
						.filter(t => t.type === "expense")
						.reduce((sum, t) => sum + t.amount, 0);

					return (
						<div key={index} className={`cell ${isCurrentMonth ? '' : 'other-month'}`}>
							<span className="date-num">{date.getDate()}</span>
							<div className="cell-amounts">
								{income > 0 && <div className="income-amount">{income.toLocaleString()}</div>}
								{expense > 0 && <div className="expense-amount">{expense.toLocaleString()}</div>}
							</div>
						</div>
					);
				})}
			</div>
		</div>//other-monthみたいなセルのスタイルを確認
	);
}