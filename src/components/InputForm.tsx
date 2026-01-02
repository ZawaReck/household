/* src/components/InputForm.tsx */

import React, { useEffect} from "react";
// import { useNavigate } from "react-router-dom";
import type { Transaction } from "../types/Transaction";

interface InputFormProps {
	onAddTransaction: (Transaction: Omit<Transaction, "id">) => void;
	onUpdateTransaction: (transaction: Transaction) => void;
	editingTransaction: Transaction | null;
	setEditingTransaction: (transaction: Transaction | null) => void;
}

export const InputForm: React.FC<InputFormProps> = ({
	onAddTransaction,
	onUpdateTransaction,
	editingTransaction,
	setEditingTransaction
}) => {
	const [type, setType] = React.useState<"expense" | "income" | "move">("expense");
	const accountOptions = ["財布", "QR", "IC", "クレカ1", "クレカ2", "銀行", "ポイント"];
	const categoryOptions = ["食料品費", "交通費旅費", "娯楽費", "光熱費", "通信費", "医療費", "教育費", "その他"];
	const [amount, setAmount] = React.useState("");
	const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
	const [name, setName] = React.useState("");
	const [category, setCategory] = React.useState(categoryOptions[0]);
	const [source, setSource] = React.useState(accountOptions[5]);
	const [memo, setMemo] = React.useState("");
	const [destination, setDestination] = React.useState(accountOptions[5]);

	useEffect(() => {
		if (editingTransaction) {
			setType(editingTransaction.type);

			setAmount(String(editingTransaction.amount));
			setDate(editingTransaction.date);
			setName(editingTransaction.name || "");
			setMemo(editingTransaction.memo || "");

			if (editingTransaction.type === "move") {
				setSource(editingTransaction.source);
				setDestination(editingTransaction.destination || "");
				// move はカテゴリ使わないならここは触らなくてOK
			} else {
				setSource(editingTransaction.source);
				setDestination(""); // 念のため
				setCategory(editingTransaction.category);
			}
		} else {
			setAmount("");
			setName("");
			setMemo("");
			// 新規入力に戻ったときの初期化（好みで）
			// setType("expense");
		}
	}, [editingTransaction]);


	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const transactionData = {
			amount: Number(amount),
			date,
			name,
			category: type === "move" ? "move" : category,
			source,
			destination: type === "move" ? destination : "",
			memo,
			isSpecial: false
		};

		if (editingTransaction) {
			onUpdateTransaction({
				id: editingTransaction.id,
				...transactionData,
				type
			});
		} else {
			onAddTransaction({
				...transactionData,
				type
			});
		}
		setEditingTransaction(null);

		setAmount("");
		setName("");
		setMemo("");
	};

	return (
		<div>
			<div className="tab-group">
				<button
					className={type === "expense" ? "active" : ""}
					onClick={() => setType("expense")}
				>
					Out
				</button>
				<button
					className={type === "income" ? "active" : ""}
					onClick={() => setType("income")}
				>
					In
				</button>
				<button
					className={type === "move" ? "active" : ""}
					onClick={() => setType("move")}
				>
					Move
				</button>
			</div>

			<form onSubmit={handleSubmit}>
				<input
					type="number"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder="Amount"
				/>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Name"
				/>
				<input
					type="date"
					value={date}
					onChange={(e) => setDate(e.target.value)}
					required
				/>
				{type === "move" && (
					<div className = "move-fields">
						<select value={source} onChange={(e) => setSource(e.target.value)}>
							{accountOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<span>から</span>
						<select value={destination} onChange={(e) => setDestination(e.target.value)}>
							{accountOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<span>へ</span>
					</div>
				)}
				{type !== "move" && (
					<div className="field">
						<label>カテゴリ</label>
						<select value={category} onChange={(e) => setCategory(e.target.value)}>//この辺でmoveが選択されているときにカテゴリを無効化する処理を各
					{categoryOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
				<select value={source} onChange={(e) => setSource(e.target.value)}>
					{accountOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
					</div>
				)}
				<input
					type="memo"
					value={memo}
					onChange={(e) => setMemo(e.target.value)}
					placeholder="Memo"
				/>
				<div className="form-buttons">
					<button type="submit">
					{editingTransaction ? "更新" : "追加"}
					</button>
					{editingTransaction && (
						<button
							type="button"
							onClick={() => setEditingTransaction(null)}
						>
							キャンセル
						</button>
					)}
				</div>
			</form>
		</div>
	);
}