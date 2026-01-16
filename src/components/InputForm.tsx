/* src/components/InputForm.tsx */

import React, { useEffect } from "react";
import type { Transaction } from "../types/Transaction";
import type { TaxMode, TaxRate } from "../types/Transaction";
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
  monthlyData: Transaction[];
}

type DraftTx = Omit<Transaction, "id">;

const normalizeTaxRate = (v: unknown): TaxRate => (v === 8 ? 8 : 10);
const normalizeTaxMode = (v: unknown): TaxMode => (v === "exclusive" ? "exclusive" : "inclusive");

export const InputForm: React.FC<InputFormProps> = ({
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  editingTransaction,
  setEditingTransaction,
  selectedDate,
  monthlyData,
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
  const [source, setSource] = React.useState(sourceOptions[1]); // 拠出元（非move）
  const [sourceMove, setSourceMove] = React.useState(sourceOptions[5]); // 移動元（move）
  const [memo, setMemo] = React.useState("");
  const [destination, setDestination] = React.useState(sourceOptions[1]); // 移動先（move）

  const [isSourcePickerOpen, setIsSourcePickerOpen] = React.useState(false);
  const [openMovePicker, setOpenMovePicker] = React.useState<null | "destination" | "sourceMove">(null);

  const [isExternalTax, setIsExternalTax] = React.useState(false);
  const [taxRate, setTaxRate] = React.useState<TaxRate>(10);

  // レシート仮置き
  const [receiptItems, setReceiptItems] = React.useState<DraftTx[]>([]);
  const [editingReceiptIndex, setEditingReceiptIndex] = React.useState<number | null>(null);

  const receiptBaseTotal = React.useMemo(
    () => receiptItems.reduce((sum, t) => sum + (t.amount || 0), 0),
    [receiptItems]
  );

  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null);

  // 税率別に合算してから端数処理する（あなたの合計表示仕様と同じ）
  const calcExternalGross = (items: Array<Pick<Transaction, "type" | "amount" | "taxRate" | "isTaxAdjustment">>) => {
    let sum10 = 0;
    let sum8 = 0;

    for (const t of items) {
      if (t.type !== "expense") continue;
      if ((t as any).isTaxAdjustment) continue; // 調整アイテムは除外
      const r = (t as any).taxRate === 8 ? 8 : 10;
      if (r === 8) sum8 += t.amount || 0;
      else sum10 += t.amount || 0;
    }

    const gross = Math.floor(sum10 * 1.1) + Math.floor(sum8 * 1.08);
    const base = sum10 + sum8;
    const tax = gross - base; // ←「外税」調整アイテムの金額

    return { base, gross, tax };
  };

// 仮登録（外税ON時の合計表示）
// 10%対象合計*1.1 + 8%対象合計*1.08（1円未満は切り捨て）
  const receiptTotalForDisplay = React.useMemo(() => {
    if (!isExternalTax) return receiptBaseTotal;

    let sum10 = 0;
    let sum8 = 0;
    let other = 0; // income/move が仮に混ざっても崩れないように

    for (const t of receiptItems) {
      if (t.type !== "expense") {
        other += t.amount || 0;
        continue;
      }
      const r = normalizeTaxRate((t as any).taxRate);
      if (r === 8) sum8 += t.amount || 0;
      else sum10 += t.amount || 0;
    }

    const taxed10 = Math.floor(sum10 * 1.1);
    const taxed8 = Math.floor(sum8 * 1.08);

    return taxed10 + taxed8 + other;
  }, [receiptItems, receiptBaseTotal, isExternalTax]);

  // 「登録済み（グループ）」の表示対象
  const committedGroupItems = React.useMemo(() => {
    const gid =
      activeGroupId ??
      ((editingTransaction as any)?.groupId as string | undefined);

    if (!gid) return [];
    return monthlyData.filter((t: any) => t.groupId === gid);
  }, [monthlyData, editingTransaction, activeGroupId]);

  // グループ内の「外税」調整アイテム（あれば）
  const committedTaxAdjustment = React.useMemo(() => {
    return committedGroupItems.find((t: any) => t.isTaxAdjustment === true) ?? null;
  }, [committedGroupItems]);

  // InputForm 下リストに見せるのは “通常アイテムだけ”
  const committedGroupVisibleItems = React.useMemo(() => {
    return committedGroupItems.filter((t: any) => t.isTaxAdjustment !== true);
  }, [committedGroupItems]);

  const onEditModeFromList = (t: Transaction) => {
    const gid = (t as any).groupId as string | undefined;
    setActiveGroupId(gid ?? null);
    setEditingTransaction(t);
  };

  const showCommittedGroup = committedGroupVisibleItems.length >= 2;

  const committedGroupTotalDisplay = React.useMemo(() => {
    if (committedGroupVisibleItems.length === 0) return 0;

    const isExternalGroup =
      committedTaxAdjustment != null || committedGroupVisibleItems.some((t: any) => t.taxMode === "exclusive");

    if (!isExternalGroup) {
      return committedGroupVisibleItems.reduce((sum, t) => sum + (t.amount || 0), 0);
    }

    const { base, tax } = calcExternalGross(committedGroupVisibleItems as any);
    return base + tax;
  }, [committedGroupVisibleItems, committedTaxAdjustment]);


  // 下リストに「今見えているアイテム数」
  const visibleCount = receiptItems.length + committedGroupVisibleItems.length;

  const showTotalBar = visibleCount >= 2;
  const displayTotal = committedGroupItems.length > 0 ? committedGroupTotalDisplay : receiptTotalForDisplay;

  // 既存の本登録アイテムを編集する時に、フォームへ反映
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);

      setAmount(String(editingTransaction.amount));
      setDate(editingTransaction.date);
      setName(editingTransaction.name || "");
      setMemo(editingTransaction.memo || "");

      if (editingTransaction.type === "move") {
        setSourceMove(editingTransaction.source);
        setDestination(editingTransaction.destination || "");
      } else {
        setSource(editingTransaction.source);
        setDestination("");
        setCategory(editingTransaction.category);
      }

      // 本登録編集に入ったら、仮編集は解除（混乱防止）
      setEditingReceiptIndex(null);

      // グループに外税調整があるなら外税扱い（単体アイテムのtaxModeより優先）
      const gid = (editingTransaction as any).groupId as string | undefined;
      if (gid) {
        const group = monthlyData.filter((t: any) => t.groupId === gid);
        const hasAdj = group.some((t: any) => t.isTaxAdjustment === true);
        setIsExternalTax(hasAdj || normalizeTaxMode((editingTransaction as any).taxMode) === "exclusive");
      } else {
        setIsExternalTax(normalizeTaxMode((editingTransaction as any).taxMode) === "exclusive");
      }

      setTaxRate(normalizeTaxRate((editingTransaction as any).taxRate));
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

  const buildDraft = (): DraftTx => {
  const base: DraftTx = {
    amount: Number(amount),
    date,
    name,
    category: type === "move" ? "move" : category,
    source: type === "move" ? sourceMove : source,
    destination: type === "move" ? destination : "",
    memo,
    isSpecial: false,
    type,
  };

  // taxMode / taxRate は支出（レシート想定）のときだけ付与
  if (type === "expense") {
    return {
      ...base,
      taxMode: isExternalTax ? "exclusive" : "inclusive",
      taxRate,
      ...(isExternalTax ? { taxBaseAmount: Number(amount) } : {}),
    };
  }

  return base;
  };

    const clearFormKeepDateKeepDate = () => {
      setAmount("");
      setName("");
      setMemo("");
      // ★ここで setDate(selectedDate) しない（＝直前の日付を保持）
    };

  // ページリロード直後 / フォームを明示的にリセットしたい時だけ使う←基本使わなさそう
  // const resetFormToSelectedDate = () => {
  //   clearFormKeepDateKeepDate();
  //   setDate(selectedDate);
  // };


  const hasFormDraft = () => {
    if (amount.trim() === "") return false;
    const n = Number(amount);
    return !Number.isNaN(n);
  };

  // 追加（submit）: 仮置きに追加 / 仮編集なら更新 / 本編集なら何もしない（本編集は登録ボタンで更新）
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!hasFormDraft()) return;

    const draft = buildDraft();

    if (editingReceiptIndex !== null) {
      setReceiptItems((prev) => prev.map((it, i) => (i === editingReceiptIndex ? draft : it)));
      setEditingReceiptIndex(null);
      clearFormKeepDateKeepDate();
      return;
    }

    setReceiptItems((prev) => [...prev, draft]);
    clearFormKeepDateKeepDate();
  };

  const loadDraftToForm = (t: DraftTx, idx: number) => {
    setEditingTransaction(null); // 本編集は解除
    setEditingReceiptIndex(idx); // 仮編集へ

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
    // 税情報
    setTaxRate(normalizeTaxRate((t as any).taxRate));
  };

  const deleteReceiptItem = (idx: number) => {
    setReceiptItems((prev) => prev.filter((_, i) => i !== idx));

    if (editingReceiptIndex === idx) {
      setEditingReceiptIndex(null);
      clearFormKeepDateKeepDate();
    } else if (editingReceiptIndex !== null && editingReceiptIndex > idx) {
      setEditingReceiptIndex(editingReceiptIndex - 1);
    }
  };


  // 登録: (1) 本編集なら更新, (2) 仮編集ならその内容含めて反映, (3) フォーム入力中があればそれも反映, (4) 仮置き全件反映
  const commitAll = () => {

  if (editingTransaction) {

  const gid = (editingTransaction as any).groupId as string | undefined;
  if (gid) setActiveGroupId(gid);

    const draft = buildDraft();
    const updated = {
     ...editingTransaction,      // ← 既存メタ（groupId, taxBaseAmount など）を保持
     ...draft,                   // ← フォームで編集した値で上書き
    id: editingTransaction.id,  // 念のため固定
    } as Transaction;

  // 外税（税別保存）なら、税別表示用の値も追従させる
    if (updated.type === "expense" && (updated as any).taxMode === "exclusive") {
      (updated as any).taxBaseAmount = updated.amount;
    }

    // まず対象アイテムを更新
    onUpdateTransaction(updated);

    // グループ編集なら「外税」調整アイテムを追従させる
    if (gid) {
      const groupAll = monthlyData.filter((t: any) => t.groupId === gid);

      const adj = groupAll.find((t: any) => t.isTaxAdjustment === true) ?? null;
      const groupBase = groupAll
        .filter((t: any) => t.isTaxAdjustment !== true)
        .map((t: any) => (t.id === updated.id ? updated : t));

      // 「外税グループ」判定：調整アイテムがある、または taxMode exclusive が含まれる
      const isExternalGroup =
        (adj != null) || groupBase.some((t: any) => t.taxMode === "exclusive");

      if (isExternalGroup) {
        const { tax } = calcExternalGross(groupBase as any);

        if (tax > 0) {
          if (adj) {
            onUpdateTransaction({
              ...adj,
              amount: tax,
              name: "外税",
              category: "外税",
              isTaxAdjustment: true,
            } as any);
          } else {
            // 無い場合は追加
            const firstExpense = groupBase.find((x: any) => x.type === "expense");
            onAddTransaction({
              type: "expense",
              amount: tax,
              date: updated.date,
              name: "外税",
              category: "外税",
              source: firstExpense?.source ?? updated.source,
              destination: "",
              memo: "",
              isSpecial: false,
              groupId: gid,
              isTaxAdjustment: true,
            } as any);
          }
        } else {
          // tax=0 なら調整アイテムは不要 → あれば削除
          if (adj) {
            onDeleteTransaction(adj.id);
          }
        }
      }
    }

    setEditingTransaction(null);
    setAmount("");
    setName("");
    setMemo("");
    return;
  }



    let itemsToCommit: DraftTx[] = receiptItems;

    if (editingReceiptIndex !== null) {
      if (hasFormDraft()) {
        const draft = buildDraft();
        itemsToCommit = receiptItems.map((it, i) => (i === editingReceiptIndex ? draft : it));
      }
    } else {
      if (hasFormDraft()) {
        const draft = buildDraft();
        itemsToCommit = [...receiptItems, draft];
      }
    }

    if (itemsToCommit.length === 0) return;

    // ★ groupId を付与して「このまとまり」を後で引けるようにする
    const groupId = activeGroupId ?? `g_${Date.now()}`;
    const baseItems = itemsToCommit.map((t) => {
      if (t.type !== "expense") return t;
      if (!isExternalTax) {
        return { ...(t as any), groupId, taxMode: "inclusive" } as any;
      }
        // 外税：税別保存
      return { ...(t as any), groupId, taxMode: "exclusive", taxBaseAmount: t.amount } as any;
    });

    baseItems.forEach((t) => onAddTransaction(t as any));

    // 外税なら調整アイテムを追加
    if (isExternalTax) {
      const { tax } = calcExternalGross(baseItems as any);
      if (tax > 0) {
        const firstExpense = baseItems.find((x: any) => x.type === "expense");
        onAddTransaction({
          type: "expense",
          amount: tax,
          date,
          name: "外税",
          category: "外税",
          source: firstExpense?.source ?? source,
          destination: "",
        memo: "",
        isSpecial: false,
        groupId,
        isTaxAdjustment: true,
        } as any);
      }
    }

    setReceiptItems([]);
    setEditingReceiptIndex(null);
    clearFormKeepDateKeepDate();
  };

  const renderTaxBadge = (t: DraftTx | Transaction) => {
    if (t.type !== "expense") return null;
    const r = normalizeTaxRate((t as any).taxRate);
    return <span className="tax-badge">{r}%</span>;
  };

  // --- 表示（TransactionHistoryと同じ見た目）を共通化 ---
  const renderRowContent = (t: DraftTx | Transaction) => {
    if (t.type === "move") {
      const dest = (t as any).destination || "";
      return (
        <>
          <div className="cat is-move">
            <span className="category-text">{t.source}</span>
            <span className="move-arrow">→</span>
          </div>
          <div className={`nm ${dest.length >= 9 ? "nm-small" : ""}`}>{dest}</div>
        </>
      );
    }

    const nm = (t as any).name || "";
    return (
      <>
        <div className="cat">
          <span className="category-text">{(t as any).category}</span>
        </div>
        <div className={`nm ${nm.length >= 9 ? "nm-small" : ""}`}>{nm || "（摘要なし）"}</div>
      </>
    );
  };

  return (
    <div className="input-form">
      <div className="tab-group">
        <button className={type === "expense" ? "active" : ""} onClick={() => handleTabClick("expense")} type="button">
          Out
        </button>
        <button className={type === "income" ? "active" : ""} onClick={() => handleTabClick("income")} type="button">
          In
        </button>
        <button className={type === "move" ? "active" : ""} onClick={() => handleTabClick("move")} type="button">
          Move
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="摘要" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        {/* 外税トグル + 税率（支出のみ） */}
        {type === "expense" && (
          <div className="tax-controls" aria-label="消費税設定">
            <label className="tax-switch">
              <input
                type="checkbox"
                checked={isExternalTax}
                onChange={(e) => setIsExternalTax(e.target.checked)}
              />
              <span className="tax-switch-ui" aria-hidden="true" />
              <span className="tax-switch-text">外税</span>
            </label>

            <div className="tax-rate-group" role="radiogroup" aria-label="税率">
              <button
                type="button"
                role="radio"
                aria-checked={taxRate === 10}
                className={`tax-rate-btn ${taxRate === 10 ? "active" : ""}`}
                onClick={() => setTaxRate(10)}
              >
                10%
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={taxRate === 8}
                className={`tax-rate-btn ${taxRate === 8 ? "active" : ""}`}
                onClick={() => setTaxRate(8)}
              >
                8%
              </button>
            </div>
          </div>
        )}

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

        <input type="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" />

        <div className="form-buttons receipt-buttons">
          <button type="button" onClick={commitAll}>
            {editingTransaction ? "更新" : "登録"}
          </button>

          <button type="submit">{editingReceiptIndex != null ? "更新" : "追加"}</button>

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
          <div className="history-list receipt-queue">
            {(receiptItems.length > 0 || showCommittedGroup) && (
              <>
            {showTotalBar && (
              <div className="date-header receipt-total-bar">
                <span>
                  合計{type === "expense" && isExternalTax && committedGroupVisibleItems.length === 0 ? "（外税→税込）" : ""}
                </span>
                <span>{displayTotal.toLocaleString()}円</span>
              </div>
            )}

            {/* 仮登録 */}
            {receiptItems.length > 0 && (
              <>
                <div className="date-header">仮登録</div>
                {receiptItems.map((t, idx) => (
                  <div
                    key={`draft-${idx}`}
                    className={`transaction-item type-${t.type} receipt-row ${editingReceiptIndex === idx ? "is-editing" : ""}`}
                    onClick={() => loadDraftToForm(t, idx)}
                  >
                    <div className="row-layout">
                      {renderRowContent(t)}
                      <div className={`amt ${String(t.amount).length >= 7 ? "amt-small" : ""}`}>
                        {Number(t.amount).toLocaleString()}円
                        {renderTaxBadge(t)}
                      </div>

                      {/* 4列目（auto）に削除ボタン */}
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
                ))}
              </>
            )}
            {showCommittedGroup && (
              <>

            {/* 登録済み（group） */}
            {committedGroupItems.length > 0 && (
              <>
                {committedGroupVisibleItems.map((t) => (
                  <div
                    key={t.id}
                    className={`transaction-item type-${t.type} receipt-row ${editingTransaction?.id === t.id ? "is-editing" : ""}`}
                    onClick={() => {
                      setEditingReceiptIndex(null);
                      onEditModeFromList(t);
                    }}
                  >
                    <div className="row-layout">
                      {renderRowContent(t)}
                      <div className={`amt ${String(t.amount).length >= 7 ? "amt-small" : ""}`}>
                        {t.amount.toLocaleString()}円
                      </div>
                      {/* 登録済み側は削除ボタン無し（必要なら付ける） */}
                      <span />
                    </div>
                  </div>
                ))}
              </>
            )}
            </>
            )}
            </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
