import React from "react";
import { useNavigate } from "react-router-dom";
import type { Transaction } from "../types/Transaction";

interface InputFormProps {
	transactions: Transaction[];
	onDeleteTransaction: (id: string) => void;
	onEditTransaction: (transaction: Transaction) => void;
}

export const TransactionList: React.FC<InputFormProps> = ({ transactions, onDeleteTransaction, onEditTransaction }) => {
	const navigate = useNavigate();
	return (
		<div>
			<h2>Transaction List</h2>
			<ul>
				{transactions.map((transaction) => (
					<li key={transaction.id}>
						<div className="transaction-details" onClick={() => onEditTransaction(transaction)}>
							<span>{transaction.date}</span>
							<span>【{transaction.category}】</span>
							<span>【{transaction.source}】</span>
							<span>{transaction.memo}</span>
							<span>{transaction.amount.toLocaleString()}円</span>
						</div>
						<div className="transaction-butttons">
							<button
								className="editーbutton"
								onClick={() => {
										onEditTransaction(transaction);
										navigate("/add");
									}}
							>
								編集
							</button>
						</div>
						<button
							className="delete-button"
							onClick={() => {
								if (window.confirm("本当に削除しますか？")) {
									onDeleteTransaction(transaction.id);
								}
							}}
							>
								削除
							</button>
					</li>
				))}
			</ul>
		</div>
	);
}