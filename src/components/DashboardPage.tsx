/* src/components/DashboardPage.tsx */

import React, { useState } from "react";
import  type { Transaction } from "../types/Transaction";
import { CalendarView } from "./CalendarView";
import { SummaryView} from "./SummaryView";
import { InputForm } from "./InputForm";
import { TransactionHistory } from "./TransactionHistory";
import './DashboardPage.css';

interface Props {
	transactions: Transaction[];
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


	return (
		<div className="dashboard-page-root">
			<section className="column calendar-section">
				<div className="scroll-content">
					<CalendarView
						year={year}
						month={month}
						monthlyData={monthlyData}
						onMonthChange={(offset: number) => setCurrentDate(new Date(year, month + offset, 1))}
						onDateClick={setSelectedDate}
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
					onEditTransaction={(transaction) => {
						setActiveGroupId(null);
						setActiveGroupDate(null);
						props.onEditTransaction(transaction);
					}}
					onSelectGroup={(groupId, date) => {
						setActiveGroupId(groupId);
						setActiveGroupDate(date);
						props.setEditingTransaction(null);
					}}
				/>
		</section>
		<section className="column input-section">
			<div className="sticky-input">
				<InputForm
					onAddTransaction={props.onAddTransaction}
					onUpdateTransaction={props.onUpdateTransaction}
					onDeleteTransaction={props.onDeleteTransaction}
					editingTransaction={props.editingTransaction}
					setEditingTransaction={props.setEditingTransaction}
					selectedDate={selectedDate}
					monthlyData={monthlyData}
					activeGroupId={activeGroupId}
					setActiveGroupId={setActiveGroupId}
					activeGroupDate={activeGroupDate}
					setActiveGroupDate={setActiveGroupDate}
				/>
			</div>
		</section>
	</div>
	);
}
