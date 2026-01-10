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
	selectedDate: string;
}

export const InputForm: React.FC<InputFormProps> = ({
	onAddTransaction,
	onUpdateTransaction,
	onDeleteTransaction,
	editingTransaction,
	setEditingTransaction,
	selectedDate,
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
	// const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
	const [date, setDate] = React.useState(selectedDate);
	const [name, setName] = React.useState("");
	const [source, setSource] = React.useState(sourceOptions[1]);//拠出元のデフォルトがQR
	const [sourceMove, setSourceMove] = React.useState(sourceOptions[5]);//拠出元のデフォルトがQR
	const [memo, setMemo] = React.useState("");
	const [destination, setDestination] = React.useState(sourceOptions[1]);//移動先のデフォルトがQR
	const [isSourcePickerOpen, setIsSourcePickerOpen] = React.useState(false);
	type DraftTx = Omit<Transaction, "id">;

	const [receiptItems, setReceiptItems] = React.useState<DraftTx[]>([]);
	const [editingReceiptIndex, setEditingReceiptIndex] = React.useState<number | null>(null);

	const receiptTotal = React.useMemo(
		() => receiptItems.reduce((sum, t) => sum + (t.amount || 0), 0),
		[receiptItems]
	);

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
			setDate(selectedDate);
		}
	}, [selectedDate, editingTransaction]);

	useEffect(() => {
		if (type === "move") return;

		setCategory((prev) => {
			const opts = type === "income" ? incomeCategoryOptions : expenseCategoryOptions;
			return opts.includes(prev) ? prev : opts[0];
		});
	}, [type]);

	const buildDraft = (): DraftTx => ({
		amount: Number(amount),
		date,
		name,
		category: type === "move" ? "move" : category,
		source: type === "move" ? sourceMove : source, // ★ moveはsourceMoveを使う
		destination: type === "move" ? destination : "",
		memo,
		isSpecial: false,
		type,
	});


	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		const draft = buildDraft();

		if (editingTransaction) {
    onUpdateTransaction({
      id: editingTransaction.id,
      ...draft,
    });
    setEditingTransaction(null);

    // 入力クリア
    setAmount("");
    setName("");
    setMemo("");
    return;
  }

	if (editingReceiptIndex !== null) {
    setReceiptItems((prev) =>
      prev.map((it, i) => (i === editingReceiptIndex ? draft : it))
    );
    setEditingReceiptIndex(null);

    setAmount("");
    setName("");
    setMemo("");
    return;
  }

		setReceiptItems((prev) => [...prev, draft]);

		setAmount("");
		setName("");
		setMemo("");
	};

	const loadDraftToForm = (t: DraftTx, idx: number) => {
		setEditingTransaction(null);          // 本体編集は解除
		setEditingReceiptIndex(idx);          // 仮編集モードへ

		setType(t.type);
		setAmount(String(t.amount));
		setDate(t.date);
		setName(t.name || "");
		setMemo(t.memo || "");

		if (t.type === "move") {
			setSourceMove(t.source);
			setDestination(t.destination || "");
		} else {
			setSource(t.source);
			setCategory(t.category);
		}
	};

	const deleteReceiptItem = (idx: number) => {
		setReceiptItems((prev) => prev.filter((_, i) => i !== idx));
		if (editingReceiptIndex === idx) {
			setEditingReceiptIndex(null);
			setAmount("");
			setName("");
			setMemo("");
		} else if (editingReceiptIndex !== null && editingReceiptIndex > idx) {
			// indexずれ補正
			setEditingReceiptIndex(editingReceiptIndex - 1);
		}
	};

	const commitReceiptItems = () => {
		if (receiptItems.length === 0) return;

		// 本体に一括追加（内部でid付与される想定）
		receiptItems.forEach((t) => onAddTransaction(t));

		// キュークリア
		setReceiptItems([]);
		setEditingReceiptIndex(null);

		// フォームも新規に戻す
		setAmount("");
		setName("");
		setMemo("");
		setDate(selectedDate);
	};

	const [openMovePicker, setOpenMovePicker] =
  React.useState<null | "source" | "destination" | "sourceMove">(null);

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
						<div className="kv-row picker-anchor">
							<div className="kv-label">移動元</div>
								<button
									type="button"
									className="kv-value-btn"
									onClick={() => setOpenMovePicker((v) => (v === "sourceMove" ? null : "sourceMove"))}
								>
									{sourceMove}
								</button>

								{openMovePicker === "sourceMove" && (
									<WheelPickerInline
										options={sourceOptions}
										value={sourceMove}
										onChange={(v) => setSourceMove(v)}
										onClose={() => setOpenMovePicker(null)}
									/>
								)}
							</div>

							<div className="kv-row-under picker-anchor">
								<div className="kv-label">移動先</div>

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
					{/* ▼ レシート仮置きリスト（ボタンの下） */}
					<div className="receipt-queue">
						<div className="receipt-queue-head">
							<div className="receipt-queue-total">
								合計：{receiptTotal.toLocaleString()}円
							</div>

							<button
								type="button"
								className="receipt-commit-btn"
								onClick={commitReceiptItems}
								disabled={receiptItems.length === 0}
							>
								一括反映（{receiptItems.length}件）
							</button>
						</div>

						{receiptItems.length === 0 ? (
							<div className="receipt-empty">まだ仮登録はありません</div>
						) : (
							<div className="receipt-list">
								{receiptItems.map((t, idx) => (
									<button
										key={idx}
										type="button"
										className={`receipt-item ${editingReceiptIndex === idx ? "is-editing" : ""}`}
										onClick={() => loadDraftToForm(t, idx)}
									>
										<div className="receipt-item-main">
											<div className="receipt-left">
												<div className="receipt-cat">
													{t.type === "move" ? "移動" : t.category}
												</div>
												<div className="receipt-name">
													{t.type === "move"
														? `${t.source} → ${t.destination}`
														: (t.name || "（摘要なし）")}
												</div>
											</div>

											<div className="receipt-amt">
												{t.amount.toLocaleString()}円
											</div>
										</div>

										<div className="receipt-sub">
											<span>{t.date}</span>
											<span>{t.type === "move" ? "" : ` / ${t.source}`}</span>
										</div>

										<button
											type="button"
											className="receipt-del"
											onClick={(e) => {
												e.stopPropagation();
												deleteReceiptItem(idx);
											}}
											aria-label="delete"
										>
											✕
										</button>
									</button>
								))}
							</div>
						)}
					</div>
					<button type="submit">
						{editingTransaction
							? "更新"
							: editingReceiptIndex !== null
								? "仮更新"
								: "仮追加"}
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