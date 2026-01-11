/* src/components/InputForm.tsx */

import React, { useEffect } from "react";
import type { Transaction } from "../types/Transaction";
import { WheelPickerInline } from "./WheelPickerInline";
import "./InputForm.css";
import "./TransactionHistory.css";

interface InputFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">) => void;
  onUpdateTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  editingTransaction: Transaction | null;
  setEditingTransaction: (transaction: Transaction | null) => void;
  selectedDate: string;
}

type DraftTx = Omit<Transaction, "id">;

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
  const [date, setDate] = React.useState(selectedDate);
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState(sourceOptions[1]);      // 拠出元（非move）
  const [sourceMove, setSourceMove] = React.useState(sourceOptions[5]); // 移動元（move）
  const [memo, setMemo] = React.useState("");
  const [destination, setDestination] = React.useState(sourceOptions[1]); // 移動先（move）

  const [isSourcePickerOpen, setIsSourcePickerOpen] = React.useState(false);
  const [openMovePicker, setOpenMovePicker] =
    React.useState<null | "destination" | "sourceMove">(null);

  // レシート仮置き
  const [receiptItems, setReceiptItems] = React.useState<DraftTx[]>([]);
  const [editingReceiptIndex, setEditingReceiptIndex] = React.useState<number | null>(null);

  const receiptTotal = React.useMemo(
    () => receiptItems.reduce((sum, t) => sum + (t.amount || 0), 0),
    [receiptItems]
  );

  // 既存の本登録アイテムを編集する時に、フォームへ反映
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);

      setAmount(String(editingTransaction.amount));
      setDate(editingTransaction.date);
      setName(editingTransaction.name || "");
      setMemo(editingTransaction.memo || "");

      if (editingTransaction.type === "move") {
        // ★ここは sourceMove / destination を使う
        setSourceMove(editingTransaction.source);
        setDestination(editingTransaction.destination || "");
      } else {
        setSource(editingTransaction.source);
        setDestination(""); // 念のため
        setCategory(editingTransaction.category);
      }

      // 本登録編集に入ったら、仮編集は解除（混乱防止）
      setEditingReceiptIndex(null);
      return;
    }

    // editingTransaction が解除されたらフォームを新規状態へ
    setAmount("");
    setName("");
    setMemo("");
    setDate(selectedDate);
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
    source: type === "move" ? sourceMove : source,
    destination: type === "move" ? destination : "",
    memo,
    isSpecial: false,
    type,
  });

  const clearForm = () => {
    setAmount("");
    setName("");
    setMemo("");
    setDate(selectedDate);
    // type/source/category は「そのまま」残す方がレシート入力では便利なので残す
  };

  const hasFormDraft = () => {
    if (amount.trim() === "") return false;
    const n = Number(amount);
    return !Number.isNaN(n);
  };

  // 追加（submit）: 仮置きに追加 / 仮編集なら更新 / 本編集なら何もしない（本編集は登録ボタンで更新）
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 本登録編集は「登録（=更新）」側でやる設計
    if (editingTransaction) return;

    // 入力が無いのに追加を押しても何もしない
    if (!hasFormDraft()) return;

    const draft = buildDraft();

    // 仮編集の更新
    if (editingReceiptIndex !== null) {
      setReceiptItems((prev) => prev.map((it, i) => (i === editingReceiptIndex ? draft : it)));
      setEditingReceiptIndex(null);
      clearForm();
      return;
    }

    // 新規仮置き追加
    setReceiptItems((prev) => [...prev, draft]);
    clearForm();
  };

  const loadDraftToForm = (t: DraftTx, idx: number) => {
    setEditingTransaction(null);   // 本編集は解除
    setEditingReceiptIndex(idx);   // 仮編集へ

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
      clearForm();
    } else if (editingReceiptIndex !== null && editingReceiptIndex > idx) {
      setEditingReceiptIndex(editingReceiptIndex - 1);
    }
  };

  // 登録: (1) 本編集なら更新, (2) 仮編集ならその内容含めて反映, (3) フォーム入力中があればそれも反映, (4) 仮置き全件反映
  const commitAll = () => {
    // 1) 本登録編集なら更新
    if (editingTransaction) {
      const draft = buildDraft();
      onUpdateTransaction({ id: editingTransaction.id, ...draft });
      setEditingTransaction(null);
      clearForm();
      return;
    }

    // 2) 仮置きの中身を作る（仮編集の内容も含める）
    let itemsToCommit: DraftTx[] = receiptItems;

    // 仮編集中なら、フォーム内容でその行を置き換えた配列をコミット対象にする
    if (editingReceiptIndex !== null) {
      // 入力が無いなら仮編集として成立しないので、ここでは何もしない
      if (hasFormDraft()) {
        const draft = buildDraft();
        itemsToCommit = receiptItems.map((it, i) => (i === editingReceiptIndex ? draft : it));
      }
    } else {
      // 3) 仮編集ではないが、フォーム入力中の1件があるならそれも追加して反映
      if (hasFormDraft()) {
        const draft = buildDraft();
        itemsToCommit = [...receiptItems, draft];
      }
    }

    if (itemsToCommit.length === 0) return;

    // 4) 一括反映
    itemsToCommit.forEach((t) => onAddTransaction(t));

    // 後始末
    setReceiptItems([]);
    setEditingReceiptIndex(null);
    clearForm();
  };

  return (
    <div className="input-form">
      <div className="tab-group">
        <button
          className={type === "expense" ? "active" : ""}
          onClick={() => handleTabClick("expense")}
          type="button"
        >
          Out
        </button>
        <button
          className={type === "income" ? "active" : ""}
          onClick={() => handleTabClick("income")}
          type="button"
        >
          In
        </button>
        <button
          className={type === "move" ? "active" : ""}
          onClick={() => handleTabClick("move")}
          type="button"
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
            {/* カテゴリ */}
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

            {/* 拠出元/入金先 */}
            <div className="kv-row picker-anchor">
              <div className="kv-label">{type === "income" ? "入金先" : "拠出先"}</div>

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

        <div className="form-buttons receipt-buttons">
          {/* 登録 = 追加して反映 / 本編集なら更新 */}
          <button type="button" onClick={commitAll}>
            {editingTransaction ? "更新" : "登録"}
          </button>

          {/* 追加 = 仮登録（仮編集なら更新） */}
          <button type="submit">
            {editingReceiptIndex != null ? "更新" : "追加"}
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
            <button type="button" onClick={() => setEditingTransaction(null)}>
              キャンセル
            </button>
          )}
        </div>

        <div className="form-buttons">
          {/* レシート仮置きリスト */}
          <div className="history-list receipt-queue">
            <div className="date-header receipt-total-bar">
              <span>合計</span>
              <span>{receiptTotal.toLocaleString()}円</span>
            </div>

            {receiptItems.length === 0 ? (
              <div className="transaction-item type-expense receipt-empty">
                （まだ仮登録はありません）
              </div>
            ) : (
              receiptItems.map((t, idx) => (
                <div
                  key={idx}
                  className={`transaction-item type-${t.type} receipt-row ${
                    editingReceiptIndex === idx ? "is-editing" : ""
                  }`}
                  onClick={() => loadDraftToForm(t, idx)}
                >
                  <div className="row-layout">
                    {t.type === "move" ? (
                      <>
                        <div className="cat is-move">
                          <span className="category-text">{t.source}</span>
                          <span className="move-arrow">→</span>
                        </div>
                        <div className={`nm ${(t.destination?.length ?? 0) >= 9 ? "nm-small" : ""}`}>
                          {t.destination}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="cat">
                          <span className="category-text">{t.category}</span>
                        </div>
                        <div className={`nm ${(t.name?.length ?? 0) >= 9 ? "nm-small" : ""}`}>
                          {t.name || "（摘要なし）"}
                        </div>
                      </>
                    )}

                    <div className={`amt ${String(t.amount).length >= 7 ? "amt-small" : ""}`}>
                      {t.amount.toLocaleString()}円
                    </div>

                    <button
                      type="button"
                      className="receipt-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteReceiptItem(idx);
                      }}
                      aria-label="delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
