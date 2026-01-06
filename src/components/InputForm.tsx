/* src/components/InputForm.tsx */

import React, { useEffect} from "react";
// import { useNavigate } from "react-router-dom";
import type { Transaction } from "../types/Transaction";
import { WheelPickerInline } from "./WheelPickerInline";
import "./InputForm.css";

interface InputFormProps {
	onAddTransaction: (Transaction: Omit<Transaction, "id">) => void;
	onUpdateTransaction: (transaction: Transaction) => void;
	onDeleteTransaction: (id: string) => void;
	editingTransaction: Transaction | null;
	setEditingTransaction: (transaction: Transaction | null) => void;
}

export const InputForm: React.FC<InputFormProps> = ({
	onAddTransaction,
	onUpdateTransaction,
	onDeleteTransaction,
	editingTransaction,
	setEditingTransaction
}) => {
	const [type, setType] = React.useState<"expense" | "income" | "move">("expense");
	const handleTabClick = (nextType: "expense" | "income" | "move") => {
		if (editingTransaction && nextType === type) {
			setEditingTransaction(null);
		}
		setType(nextType);
	};

	const sourceOptions = ["財布", "QR", "IC", "クレカ1", "クレカ2", "銀行", "ポイント"];
	const expenseCategoryOptions = ["食料品費", "交通費旅費", "娯楽費", "光熱費", "通信費", "医療費", "教育費", "その他"];
	const incomeCategoryOptions = ["月収", "臨時収入", "副次収入", "その他"];
	const categoryOptions = type === "income" ? incomeCategoryOptions : expenseCategoryOptions;
	const [category, setCategory] = React.useState(expenseCategoryOptions[0]);
	const [amount, setAmount] = React.useState("");
	const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
	const [name, setName] = React.useState("");
	const [source, setSource] = React.useState(sourceOptions[5]);
	const [memo, setMemo] = React.useState("");
	const [destination, setDestination] = React.useState(sourceOptions[5]);
	const [isSourcePickerOpen, setIsSourcePickerOpen] = React.useState(false);


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

	useEffect(() => {
		if (type === "move") return;

		setCategory((prev) => {
			const opts = type === "income" ? incomeCategoryOptions : expenseCategoryOptions;
			return opts.includes(prev) ? prev : opts[0];
		});
	}, [type]);

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

	const [openMovePicker, setOpenMovePicker] =
  React.useState<null | "source" | "destination">(null);

	return (
		<div className="input-form">
			<div className="tab-group">
				<button
					className={type === "expense" ? "active" : ""}
					onClick={() => handleTabClick("expense")}
				>
					Out
				</button>
				<button
					className={type === "income" ? "active" : ""}
					onClick={() => handleTabClick("income")}
				>
					In
				</button>
				<button
					className={type === "move" ? "active" : ""}
					onClick={() => handleTabClick("move")}
				>
					Move
				</button>
			</div>

			<form onSubmit={handleSubmit}>
				<input
					type="number"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder="金額"
				/>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="摘要"
				/>
				<input
					type="date"
					value={date}
					onChange={(e) => setDate(e.target.value)}
					required
				/>
				{type === "move" && (
					<div className="move-fields">
						<div className="picker-anchor">
							<button
								type="button"
								className="kv-value-btn"
								onClick={() => setOpenMovePicker((v) => (v === "source" ? null : "source"))}
							>
								{source}
							</button>

							{openMovePicker === "source" && (
								<WheelPickerInline
									options={sourceOptions}
									value={source}
									onChange={(v) => setSource(v)}
									onClose={() => setOpenMovePicker(null)}
								/>
							)}
						</div>

						<span>から</span>

						<div className="picker-anchor">
							<button
								type="button"
								className="kv-value-btn"
								onClick={() => setOpenMovePicker((v) => (v === "destination" ? null : "destination"))}
							>
								{destination}
							</button>

							{openMovePicker === "destination" && (
								<WheelPickerInline
									options={sourceOptions}
									value={destination}
									onChange={(v) => setDestination(v)}
									onClose={() => setOpenMovePicker(null)}
								/>
							)}
						</div>

						<span>へ</span>
					</div>
				)}

				{type !== "move" && (
					<div className="field">
						{/* カテゴリ（既存） */}
						<div className="category-buttons" role="radiogroup" aria-label="カテゴリ">
							{categoryOptions.map((option) => (
								<button
									key={option}
									type="button"
									role="radio"
									aria-checked={category === option}
									className={`category-btn ${category === option ? "active" : ""}`}
									onClick={() => setCategory(option)}
								>
									{option}
								</button>
							))}
						</div>

						{/* ★カテゴリの次の行に拠出元（1行UI） */}
						<div className="kv-row picker-anchor">
							<div className="kv-label">
								{type == "income" ? "入金先" : "拠出先"}
							</div>

							<button
								type="button"
								className="kv-value-btn"
								onClick={() => setIsSourcePickerOpen((v) => !v)}
								aria-expanded={isSourcePickerOpen}
							>
								{source}
							</button>

							{isSourcePickerOpen && (
								<WheelPickerInline
									options={sourceOptions}
									value={source}
									onChange={(v) => setSource(v)}
									onClose={() => setIsSourcePickerOpen(false)}
								/>
							)}
						</div>
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
							onClick={() => {
								const ok = window.confirm("この項目を削除しますか？");
								if (!ok) return;
								onDeleteTransaction(editingTransaction.id);
								setEditingTransaction(null);
							}}
						>
							削除
						</button>
					)}
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