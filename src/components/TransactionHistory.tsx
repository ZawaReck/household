import React from "react";
// import { useNavigate } from "react-router-dom";
import type { Transaction } from "../types/Transaction";
import './TransactionHistory.css';

interface Props {
	monthlyData: Transaction[];
	onDeleteTransaction: (id: string) => void;
	onEditTransaction: (transaction: Transaction) => void;
}

export const TransactionHistory: React.FC<Props> = ({ monthlyData, onDeleteTransaction, onEditTransaction }) => {
	const grouped = monthlyData.reduce((acc, transaction) => {
		const date = transaction.date;
		if (!acc[date]) acc[date] = [];
		acc[date].push(transaction);
			return acc;
		}, {} as Record<string, Transaction[]>);

	const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

	// const navigate = useNavigate();
	return (
		<div className="history-list">
			{sortedDates.map(date => (
				<div key={date} className="date-group">
					<div className="date-header">
					{new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
					</div>

					<div className="day-transactions">
						{grouped[date].map((transaction) => (
							<div key={transaction.id} className={`transaction-item type-${transaction.type}`}>
							<div className="item-content" onClick={() => onEditTransaction(transaction)}>
								<div className="item-main">
									<span className="category">【{transaction.category}】</span>
									<span className="name">【{transaction.name}】</span>
								</div>

								<div className="item-sub">
									{transaction.type === "move" && <span className="move-tag">移動</span>}
									<span className="amount">{transaction.type === "income" ? "+" : "-"}{transaction.amount.toLocaleString()}円</span>
								</div>
							</div>
							<button className="history-delete-button" onClick={() => {
								if (window.confirm("この記録を削除しますか？")) onDeleteTransaction(transaction.id);
							}}
							>
								×
							</button>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
};