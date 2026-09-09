/* src/components/DashboardPage.tsx */

import React, { useState } from "react";
import  type { Transaction } from "../types/Transaction";
import type { Account } from "../types/Account";
import type { Category } from "../types/Category";
import { CalendarView } from "./CalendarView";
import { SummaryView} from "./SummaryView";
import { InputForm } from "./InputForm";
import { TransactionHistory } from "./TransactionHistory";
import { HistorySearch } from "./HistorySearch";
import './DashboardPage.css';

interface Props {
	transactions: Transaction[];
	accounts: Account[];
	categories: Category[];
	onDeleteTransaction: (id: string) => void;
	onEditTransaction: (transaction: Transaction) => void;
	onAddTransaction: (transaction: Omit<Transaction, "id">) => void;
	onUpdateTransaction: (transaction: Transaction) => void;
	editingTransaction: Transaction | null;
	setEditingTransaction: (transaction: Transaction | null) => void;
}

export const DashboardPage: React.FC<Props> = (props) => {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [activeGroupDate, setActiveGroupDate] = useState<string | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [isInputSheetOpen, setIsInputSheetOpen] = useState(false);
	const [isInputSheetExpanded, setIsInputSheetExpanded] = useState(false);

	const year = currentDate.getFullYear();
	const month = currentDate.getMonth();

	//１．今月のデータ抽出
	const monthlyData = props.transactions.filter((transaction) => {
		const transactionDate = new Date(transaction.date);
		return transactionDate.getFullYear() === year && transactionDate.getMonth() === month;
	});

	//2. 繰越金計算
	const openingBalance = props.transactions
		.filter((transaction) => new Date(transaction.date) < new Date(year, month, 1))
		.reduce((sum, transaction) => {
			if (transaction.type === "income") return sum + transaction.amount;
			if (transaction.type === "expense") return sum - transaction.amount;
			return sum;
		}, 0);

		const [selectedDate, setSelectedDate] = React.useState(
			new Date().toISOString().slice(0, 10)
		);

	const openEditSheet = (transaction: Transaction) => {
		setActiveGroupId(null);
		setActiveGroupDate(null);
		props.onEditTransaction(transaction);
		setIsInputSheetOpen(true);
		setIsInputSheetExpanded(false);
	};

	const handleDateClick = (date: string) => {
		if (date === selectedDate) {
			props.setEditingTransaction(null);
			setActiveGroupId(null);
			setActiveGroupDate(null);
			setIsInputSheetOpen(true);
			setIsInputSheetExpanded(false);
			return;
		}
		setSelectedDate(date);
		window.requestAnimationFrame(() => {
			document.getElementById(`history-date-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	};


	return (
		<div className="dashboard-page-root">
			<section className="column calendar-section">
				<div className="scroll-content">
					<CalendarView
						year={year}
						month={month}
						monthlyData={monthlyData}
						onMonthChange={(offset: number) => setCurrentDate(new Date(year, month + offset, 1))}
						onDateClick={handleDateClick}
						onOpenSearch={() => setIsSearchOpen(true)}
						selectedDate={selectedDate}
						/>
						<SummaryView
							monthlyData={monthlyData}
							openingBalance={openingBalance}
					/>
				</div>
			</section>
			<section className="column history-section">
				<TransactionHistory
					monthlyData={monthlyData}
					onDeleteTransaction={props.onDeleteTransaction}
					onEditTransaction={openEditSheet}
					onSelectGroup={(groupId, date) => {
						setActiveGroupId(groupId);
						setActiveGroupDate(date);
						props.setEditingTransaction(null);
						setIsInputSheetOpen(true);
						setIsInputSheetExpanded(false);
					}}
				/>
		</section>
		{isInputSheetOpen && <button className="input-sheet-backdrop" aria-label="入力画面を閉じる" onClick={() => setIsInputSheetOpen(false)} />}
		<section
			className={`column input-section ${isInputSheetOpen ? "sheet-open" : ""} ${isInputSheetExpanded ? "sheet-expanded" : ""}`}
			onFocusCapture={() => setIsInputSheetExpanded(true)}
		>
			<div className="input-sheet-toolbar">
				<button
					type="button"
					className="input-sheet-handle"
					aria-label={isInputSheetExpanded ? "入力画面を縮める" : "入力画面を広げる"}
					onClick={() => setIsInputSheetExpanded((current) => !current)}
				><span /></button>
				<button type="button" className="input-sheet-close" aria-label="入力画面を閉じる" onClick={() => setIsInputSheetOpen(false)}>×</button>
			</div>
			<div className="sticky-input">
				<InputForm
					onAddTransaction={props.onAddTransaction}
					onUpdateTransaction={props.onUpdateTransaction}
					onDeleteTransaction={props.onDeleteTransaction}
					editingTransaction={props.editingTransaction}
					setEditingTransaction={props.setEditingTransaction}
					selectedDate={selectedDate}
					monthlyData={monthlyData}
					accounts={props.accounts}
					categories={props.categories}
					activeGroupId={activeGroupId}
					setActiveGroupId={setActiveGroupId}
					activeGroupDate={activeGroupDate}
					setActiveGroupDate={setActiveGroupDate}
				/>
			</div>
		</section>
		{isSearchOpen && (
			<HistorySearch
				transactions={props.transactions}
				onClose={() => setIsSearchOpen(false)}
				onDeleteTransaction={props.onDeleteTransaction}
				onEditTransaction={(transaction) => {
					setIsSearchOpen(false);
					openEditSheet(transaction);
				}}
				onSelectGroup={(groupId, date) => {
					setIsSearchOpen(false);
					setActiveGroupId(groupId);
					setActiveGroupDate(date);
				}}
			/>
		)}
	</div>
	);
}
