/* src/components/InputForm.tsx */

import React, { useEffect } from "react";
import type { Transaction } from "../types/Transaction";
import type { TaxMode, TaxRate, TransactionClassification } from "../types/Transaction";
import type { Account } from "../types/Account";
import type { Category } from "../types/Category";
import { expenseCategoryOptions, incomeCategoryOptions } from "../data/categoryOptions";
import { WheelPickerInline } from "./WheelPickerInline";
import { DateWheelPicker } from "./DateWheelPicker";
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
  accounts: Account[];
  categories: Category[];
  activeGroupId?: string | null;
  setActiveGroupId?: (groupId: string | null) => void;
  activeGroupDate?: string | null;
  setActiveGroupDate?: (date: string | null) => void;
}

type DraftTx = Omit<Transaction, "id">;

const normalizeTaxRate = (v: unknown): TaxRate => (v === 0 || v === 8 ? v : 10);
const normalizeTaxMode = (v: unknown): TaxMode => (v === "exclusive" ? "exclusive" : "inclusive");

export const InputForm: React.FC<InputFormProps> = ({
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  editingTransaction,
  setEditingTransaction,
  selectedDate,
  monthlyData,
  accounts,
  categories,
  activeGroupId: activeGroupIdProp,
  setActiveGroupId: setActiveGroupIdProp,
  activeGroupDate: activeGroupDateProp,
  setActiveGroupDate: setActiveGroupDateProp,
}) => {
  const [type, setType] = React.useState<"expense" | "income" | "move">("expense");

  const [localActiveGroupId, setLocalActiveGroupId] = React.useState<string | null>(null);
  const [localActiveGroupDate, setLocalActiveGroupDate] = React.useState<string | null>(null);

  const activeGroupId = activeGroupIdProp ?? localActiveGroupId;
  const setActiveGroupId = setActiveGroupIdProp ?? setLocalActiveGroupId;
  const activeGroupDate = activeGroupDateProp ?? localActiveGroupDate;
  const setActiveGroupDate = setActiveGroupDateProp ?? setLocalActiveGroupDate;

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const handleTabClick = (nextType: "expense" | "income" | "move") => {
    setEditingTransaction(null);
    setEditingReceiptIndex(null);
    setReceiptItems([]);
    setActiveGroupId(null);
    setActiveGroupDate(null);
    setType(nextType);
    resetForm(nextType, { dateValue: todayISO() });
  };

  const activeAccountNames = React.useMemo(
    () => accounts.filter((account) => account.isActive).map((account) => account.name),
    [accounts]
  );
  const paymentAccountNames = React.useMemo(
    () => accounts
      .filter((account) => account.isActive && account.kind !== "credit_card")
      .map((account) => account.name),
    [accounts]
  );
  const sourceOptions = type === "expense" ? activeAccountNames : paymentAccountNames;
  const categoryOptions = React.useMemo(() => categories
    .filter((item) => item.isActive && item.type === (type === "income" ? "income" : "expense"))
    .map((item) => item.name), [categories, type]);

  const defaultExpenseCategory = categoryOptions[0] ?? expenseCategoryOptions[0];
  const defaultIncomeCategory = categoryOptions[0] ?? incomeCategoryOptions[0];
  const defaultSource = activeAccountNames[0] ?? "";
  const defaultMoveSource = paymentAccountNames[0] ?? "";
  const defaultMoveDestination = paymentAccountNames[1] ?? paymentAccountNames[0] ?? "";

  const [category, setCategory] = React.useState(defaultExpenseCategory);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(selectedDate);
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState(defaultSource); // 拠出元（非move）
  const [sourceMove, setSourceMove] = React.useState(defaultMoveSource); // 移動元（move）
  const [memo, setMemo] = React.useState("");
  const [classification, setClassification] = React.useState<TransactionClassification>("normal");
  const [destination, setDestination] = React.useState(defaultMoveDestination); // 移動先（move）
  const [moveFee, setMoveFee] = React.useState("");

  useEffect(() => {
    if (!activeAccountNames.includes(source)) setSource(defaultSource);
    if (!paymentAccountNames.includes(sourceMove)) setSourceMove(defaultMoveSource);
    if (!paymentAccountNames.includes(destination)) setDestination(defaultMoveDestination);
  }, [activeAccountNames, defaultMoveDestination, defaultMoveSource, defaultSource, destination, paymentAccountNames, source, sourceMove]);

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

  // 税率別に合算してから端数処理する（あなたの合計表示仕様と同じ）
  const calcExternalGross = (items: Array<Pick<Transaction, "type" | "amount" | "taxRate" | "isTaxAdjustment">>) => {
    let sum10 = 0;
    let sum8 = 0;
    let sum0 = 0;

    for (const t of items) {
      if (t.type !== "expense") continue;
      if ((t as any).isTaxAdjustment) continue; // 調整アイテムは除外
      const r = normalizeTaxRate((t as any).taxRate);
      if (r === 8) sum8 += t.amount || 0;
      else if (r === 0) sum0 += t.amount || 0;
      else sum10 += t.amount || 0;
    }

    const gross = Math.floor(sum10 * 1.1) + Math.floor(sum8 * 1.08) + sum0;
    const base = sum10 + sum8 + sum0;
    const tax = gross - base; // ←「外税」調整アイテムの金額

    return { base, gross, tax };
  };

  // 仮登録（外税ON時の合計表示）
  // 10%対象合計*1.1 + 8%対象合計*1.08（1円未満は切り捨て）
  const receiptTotalForDisplay = React.useMemo(() => {
    if (!isExternalTax) return receiptBaseTotal;

    let sum10 = 0;
    let sum8 = 0;
    let sum0 = 0;
    let other = 0; // income/move が仮に混ざっても崩れないように

    for (const t of receiptItems) {
      if (t.type !== "expense") {
        other += t.amount || 0;
        continue;
      }
      const r = normalizeTaxRate((t as any).taxRate);
      if (r === 8) sum8 += t.amount || 0;
      else if (r === 0) sum0 += t.amount || 0;
      else sum10 += t.amount || 0;
    }

    const taxed10 = Math.floor(sum10 * 1.1);
    const taxed8 = Math.floor(sum8 * 1.08);

    return taxed10 + taxed8 + sum0 + other;
  }, [receiptItems, receiptBaseTotal, isExternalTax]);

  // 「登録済み（グループ）」の表示対象
  const committedGroupItems = React.useMemo(() => {
    const gid =
      activeGroupId ??
      ((editingTransaction as any)?.groupId as string | undefined);

    if (!gid) return [];
    return monthlyData.filter((t: any) => t.groupId === gid);
  }, [monthlyData, editingTransaction, activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) return;
    if (editingTransaction) return;

    const groupItems = monthlyData.filter((t: any) => t.groupId === activeGroupId);
    const visibleItems = groupItems.filter((t: any) => t.isTaxAdjustment !== true);
    const first = visibleItems[0];

    if (first) {
      setType(first.type);
      setDate(first.date);
    } else if (activeGroupDate) {
      setDate(activeGroupDate);
    }

    setEditingReceiptIndex(null);
    setReceiptItems([]);
    resetForm(first?.type ?? type, { dateValue: first?.date ?? activeGroupDate ?? date });

    const isExternalGroup =
      groupItems.some((t: any) => t.isTaxAdjustment === true) ||
      visibleItems.some((t: any) => t.taxMode === "exclusive");

    setIsExternalTax(isExternalGroup);
  }, [activeGroupId, activeGroupDate, monthlyData, editingTransaction]);

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
    setActiveGroupDate(t.date);
    setEditingTransaction(t);
  };

  const hasActiveGroupView = activeGroupId != null;
  const showCommittedGroup = hasActiveGroupView
    ? committedGroupVisibleItems.length > 0
    : committedGroupVisibleItems.length >= 2;

  const committedGroupIsExternal =
    committedTaxAdjustment != null || committedGroupVisibleItems.some((t: any) => t.taxMode === "exclusive");

  const committedGroupTotalDisplay = React.useMemo(() => {
    if (committedGroupVisibleItems.length === 0) return 0;

    if (!committedGroupIsExternal) {
      return committedGroupVisibleItems.reduce((sum, t) => sum + (t.amount || 0), 0);
    }

    const { base, tax } = calcExternalGross(committedGroupVisibleItems as any);
    return base + tax;
  }, [committedGroupVisibleItems, committedGroupIsExternal]);


  const showTotalBar = receiptItems.length > 0 || committedGroupVisibleItems.length >= 2;
  const displayTotal = committedGroupItems.length > 0
    ? committedGroupTotalDisplay + receiptTotalForDisplay
    : receiptTotalForDisplay;

  // 既存の本登録アイテムを編集する時に、フォームへ反映
  useEffect(() => {
    if (!editingTransaction) return;

    setType(editingTransaction.type);

    setAmount(String(editingTransaction.amount));
    setDate(editingTransaction.date);
    setName(editingTransaction.name || "");
    setMemo(editingTransaction.memo || "");
    setClassification(
      editingTransaction.classification ?? (editingTransaction.isSpecial ? "special" : "normal")
    );

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
  }, [editingTransaction, monthlyData]);

  useEffect(() => {
    if (editingTransaction) return;
    if (activeGroupId) return;
    setDate(selectedDate);
  }, [selectedDate, editingTransaction, activeGroupId]);

  useEffect(() => {
    if (type !== "expense") {
      setIsExternalTax(false);
      setTaxRate(10);
    }
    if (type === "move") {
      return;
    }

    setCategory((prev) => {
      const opts = categoryOptions;
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
      classification: type === "move" ? "normal" : classification,
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

  const resetForm = (
    nextType: "expense" | "income" | "move" = type,
    options: { keepDate?: boolean; dateValue?: string; keepTaxControls?: boolean } = {}
  ) => {
    const nextDate = options.keepDate ? date : (options.dateValue ?? selectedDate);
    const nextCategory = nextType === "income" ? defaultIncomeCategory : defaultExpenseCategory;

    setAmount("");
    setName("");
    setMemo("");
    setClassification("normal");
    if (!options.keepTaxControls) {
      setIsExternalTax(false);
      setTaxRate(10);
    }
    setCategory(nextCategory);
    setSource(defaultSource);
    setSourceMove(defaultMoveSource);
    setDestination(defaultMoveDestination);
    setMoveFee("");
    setDate(nextDate);
    setIsSourcePickerOpen(false);
    setOpenMovePicker(null);
  };

  const parseAmount = () => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : NaN;
  };

  const hasFormDraft = () => {
    if (amount.trim() === "") return false;
    if (type !== "move" && name.trim() === "") return false;
    const n = parseAmount();
    if (!Number.isFinite(n) || n <= 0) return false;
    if (type === "move" && (!sourceMove || !destination || sourceMove === destination)) return false;
    if (type === "expense" && !Number.isInteger(n)) return false;
    return true;
  };

  // 追加（submit）: 仮置きに追加 / 仮編集なら更新 / 本編集なら何もしない（本編集は登録ボタンで更新）
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (type !== "expense" || editingTransaction) return;
    if (!hasFormDraft()) return;

    const draft = buildDraft();

    if (editingReceiptIndex !== null) {
      setReceiptItems((prev) => prev.map((it, i) => (i === editingReceiptIndex ? draft : it)));
      setEditingReceiptIndex(null);
      resetForm(type, { keepDate: true, keepTaxControls: true });
      return;
    }

    setReceiptItems((prev) => [...prev, draft]);
    resetForm(type, { keepDate: true, keepTaxControls: true });
  };

  const loadDraftToForm = (t: DraftTx, idx: number) => {
    setEditingTransaction(null); // 本編集は解除
    setEditingReceiptIndex(idx); // 仮編集へ

    setType(t.type);
    setAmount(String(t.amount));
    setDate(t.date);
    setName(t.name || "");
    setMemo(t.memo || "");
    setClassification(t.classification ?? (t.isSpecial ? "special" : "normal"));

    if (t.type === "move") {
      setSourceMove(t.source);
      setDestination(t.destination || "");
    } else {
      setSource(t.source);
      setCategory(t.category);
    }
    // 税情報
    setIsExternalTax(normalizeTaxMode((t as any).taxMode) === "exclusive");
    setTaxRate(normalizeTaxRate((t as any).taxRate));
  };

  const deleteReceiptItem = (idx: number) => {
    setReceiptItems((prev) => prev.filter((_, i) => i !== idx));

    if (editingReceiptIndex === idx) {
      setEditingReceiptIndex(null);
      resetForm(type, { keepDate: true });
    } else if (editingReceiptIndex !== null && editingReceiptIndex > idx) {
      setEditingReceiptIndex(editingReceiptIndex - 1);
    }
  };


  // 登録: (1) 本編集なら更新, (2) 仮編集ならその内容含めて反映, (3) フォーム入力中があればそれも反映, (4) 仮置き全件反映
  const commitAll = () => {
    if (!editingTransaction && !hasFormDraft() && receiptItems.length === 0 && showCommittedGroup) {
      setEditingTransaction(null);
      setActiveGroupId(null);
      setActiveGroupDate(null);
      setEditingReceiptIndex(null);
      resetForm(type, { dateValue: selectedDate });
      return;
    }

    if (editingTransaction) {
      if (!hasFormDraft()) return;

      const gid = (editingTransaction as any).groupId as string | undefined;
      if (gid) setActiveGroupId(gid);

      const draft = buildDraft();
      const updated = {
        ...editingTransaction, // ← 既存メタ（groupId, taxBaseAmount など）を保持
        ...draft, // ← フォームで編集した値で上書き
        id: editingTransaction.id, // 念のため固定
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
      resetForm(updated.type, { keepDate: true });
      return;
    }

    let itemsToCommit: DraftTx[] = [];

    if (type === "expense") {
      itemsToCommit = receiptItems;

      if (editingReceiptIndex !== null) {
        if (hasFormDraft()) {
          const draft = buildDraft();
          itemsToCommit = receiptItems.map((it, i) => (i === editingReceiptIndex ? draft : it));
        } else {
          return;
        }
      } else if (hasFormDraft()) {
        const draft = buildDraft();
        itemsToCommit = [...receiptItems, draft];
      }
    } else {
      if (!hasFormDraft()) return;
      itemsToCommit = [buildDraft()];
    }

    if (itemsToCommit.length === 0) return;

    const groupId = type === "expense" ? (activeGroupId ?? `g_${Date.now()}`) : undefined;

    const moveRelationId = type === "move" && Number(moveFee) > 0 ? crypto.randomUUID() : undefined;
    // ★ groupId を付与して「このまとまり」を後で引けるようにする
    const baseItems = itemsToCommit.map((t) => {
      if (t.type !== "expense") return moveRelationId ? { ...t, relationId: moveRelationId } : t;
      if (!isExternalTax) {
        return { ...(t as any), groupId, taxMode: "inclusive" } as any;
      }
      // 外税：税別保存
      return { ...(t as any), groupId, taxMode: "exclusive", taxBaseAmount: t.amount } as any;
    });

    baseItems.forEach((t) => onAddTransaction(t as any));

    if (type === "move") {
      const fee = Number(moveFee);
      if (Number.isFinite(fee) && fee > 0) {
        onAddTransaction({ type: "expense", amount: Math.floor(fee), date, name: "振込手数料", category: "その他", source: sourceMove, destination: "", memo: "", isSpecial: false, classification: "normal", relationId: moveRelationId });
      }
    }

    if (type === "expense" && isExternalTax) {
      const baseExpenses = baseItems.filter((x: any) => x.type === "expense");
      const existingGroup = activeGroupId
        ? monthlyData.filter((t: any) => t.groupId === groupId)
        : [];
      const existingBase = existingGroup.filter((t: any) => t.isTaxAdjustment !== true);
      const adj = existingGroup.find((t: any) => t.isTaxAdjustment === true) ?? null;
      const groupBase = [...existingBase, ...baseExpenses];
      const { tax } = calcExternalGross(groupBase as any);
      const firstExpense = groupBase.find((x: any) => x.type === "expense");
      const groupDate = firstExpense?.date ?? date;

      if (tax > 0) {
        if (adj) {
          onUpdateTransaction({
            ...adj,
            amount: tax,
            name: "外税",
            category: "外税",
            date: groupDate,
            isTaxAdjustment: true,
          } as any);
        } else if (groupId) {
          onAddTransaction({
            type: "expense",
            amount: tax,
            date: groupDate,
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
      } else if (adj) {
        onDeleteTransaction(adj.id);
      }
    }

    setReceiptItems([]);
    setEditingReceiptIndex(null);
    resetForm(type, { keepDate: true });
  };

  const calcTaxedAmount = (base: number, rate: TaxRate) => {
    if (rate === 0) return base;
    if (rate === 8) return Math.floor(base * 1.08);
    return Math.floor(base * 1.1);
  };

  const renderTaxBadge = (t: DraftTx | Transaction) => {
    if (!isExternalTax) return null;
    if (t.type !== "expense") return null;
    const r = normalizeTaxRate((t as any).taxRate);
    return <span className="tax-badge">{r}%</span>;
  };

  const getReceiptDisplayAmount = (t: DraftTx) => {
    if (!isExternalTax || t.type !== "expense") return t.amount;
    const r = normalizeTaxRate((t as any).taxRate);
    return calcTaxedAmount(t.amount, r);
  };

  const getCommittedDisplayAmount = (t: Transaction) => {
    if (t.type !== "expense") return t.amount;
    if (!committedGroupIsExternal) return t.amount;
    if (committedGroupVisibleItems.length >= 2) return t.amount;
    const r = normalizeTaxRate((t as any).taxRate);
    return calcTaxedAmount(t.amount, r);
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

  const tabIndex = type === "expense" ? 0 : type === "income" ? 1 : 2;

  return (
    <div className="input-form">
      <div className="tab-group" style={{ "--tab-index": tabIndex } as React.CSSProperties}>
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

      {type !== "move" && (
        <div className="classification-control" role="radiogroup" aria-label="集計区分">
          {([
            ["normal", "通常"],
            ["settled", "通算"],
            ["special", "特別"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={classification === value}
              className={classification === value ? "active" : ""}
              onClick={() => setClassification(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="row-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="摘要"
            required={type !== "move"}
          />
          <input
            type="number"
            min="1"
            step={type === "expense" ? "1" : "any"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金額"
            required
          />
        </div>
        <DateWheelPicker value={date} onChange={setDate} />

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

            {isExternalTax && (
              <div className="tax-rate-group" role="radiogroup" aria-label="税率">
                <button
                  type="button"
                  role="radio"
                  aria-checked={taxRate === 0}
                  className={`tax-rate-btn ${taxRate === 0 ? "active" : ""}`}
                  onClick={() => setTaxRate(0)}
                >
                  0%
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
                <button
                  type="button"
                  role="radio"
                  aria-checked={taxRate === 10}
                  className={`tax-rate-btn ${taxRate === 10 ? "active" : ""}`}
                  onClick={() => setTaxRate(10)}
                >
                  10%
                </button>
              </div>
            )}
          </div>
        )}

        {type === "move" && (
          <div className="move-fields">
            <div className="kv-row picker-anchor">
              <button
                type="button"
                className="kv-value-btn"
                onClick={() => setOpenMovePicker((v) => (v === "sourceMove" ? null : "sourceMove"))}
              >
                <span className="kv-label">移動元</span>
                <span className="kv-value-text">{sourceMove}</span>
              </button>

              {openMovePicker === "sourceMove" && (
                <WheelPickerInline
                  options={paymentAccountNames}
                  value={sourceMove}
                  onChange={(v) => setSourceMove(v)}
                  onClose={() => setOpenMovePicker(null)}
                />
              )}
            </div>

            <div className="kv-row-under picker-anchor">
              <button
                type="button"
                className="kv-value-btn"
                onClick={() => setOpenMovePicker((v) => (v === "destination" ? null : "destination"))}
              >
                <span className="kv-label">移動先</span>
                <span className="kv-value-text">{destination}</span>
              </button>

              {openMovePicker === "destination" && (
                <WheelPickerInline
                  options={paymentAccountNames}
                  value={destination}
                  onChange={(v) => setDestination(v)}
                  onClose={() => setOpenMovePicker(null)}
                />
              )}
            </div>
            <div className="kv-row-under">
              <label className="kv-value-btn"><span className="kv-label">手数料</span><input type="number" min="0" step="1" value={moveFee} onChange={(event) => setMoveFee(event.target.value)} placeholder="0" /></label>
            </div>
          </div>
        )}

        {type !== "move" && (
          <div className="field">
            <div className="category-buttons-wrap">
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
            </div>

            <div className="kv-row picker-anchor">
              <button
                type="button"
                className="kv-value-btn"
                onClick={() => setIsSourcePickerOpen((v) => !v)}
                aria-expanded={isSourcePickerOpen}
              >
                <span className="kv-label">{type === "income" ? "入金先" : "拠出元"}</span>
                <span className="kv-value-text">{source}</span>
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

        <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" />

        <div className="form-buttons receipt-buttons">
          <button type="button" onClick={commitAll}>
            {editingTransaction ? "更新" : "登録"}
          </button>

          {!editingTransaction && type === "expense" && (
            <button type="submit">{editingReceiptIndex != null ? "更新" : "追加"}</button>
          )}

          {editingTransaction && (
            <button
              type="button"
              onClick={() => {
                onDeleteTransaction(editingTransaction.id);
                setEditingTransaction(null);
                resetForm(type, { keepDate: true });
              }}
            >
              削除
            </button>
          )}

          {editingTransaction && (
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setReceiptItems([]);
                setEditingReceiptIndex(null);
                setActiveGroupId(null);
                setActiveGroupDate(null);
                resetForm(type, { dateValue: selectedDate });
              }}
            >
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
                {receiptItems.map((t, idx) => {
                  const displayAmount = getReceiptDisplayAmount(t);
                  return (
                    <div
                      key={`draft-${idx}`}
                      className={`transaction-item type-${t.type} receipt-row ${editingReceiptIndex === idx ? "is-editing" : ""}`}
                      onClick={() => loadDraftToForm(t, idx)}
                    >
                      <div className="row-layout">
                        {renderRowContent(t)}
                        <div className={`amt ${String(displayAmount).length >= 7 ? "amt-small" : ""}`}>
                          {renderTaxBadge(t)}
                          {displayAmount.toLocaleString()}円
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
                  );
                })}
              </>
            )}
            {showCommittedGroup && (
              <>

            {/* 登録済み（group） */}
            {committedGroupItems.length > 0 && (
              <>
                {committedGroupVisibleItems.map((t, idx) => {
                  const displayAmount = getCommittedDisplayAmount(t);
                  const boundaryTop = idx === 0 && !showTotalBar;
                  return (
                    <div
                      key={t.id}
                      className={`transaction-item type-${t.type} receipt-row ${boundaryTop ? "boundary-top" : ""} ${editingTransaction?.id === t.id ? "is-editing" : ""}`}
                      onClick={() => {
                        setEditingReceiptIndex(null);
                        onEditModeFromList(t);
                      }}
                    >
                      <div className="row-layout">
                        {renderRowContent(t)}
                        <div className={`amt ${String(displayAmount).length >= 7 ? "amt-small" : ""}`}>
                          {displayAmount.toLocaleString()}円
                        </div>
                        {/* 登録済み側は削除ボタン無し（必要なら付ける） */}
                        <span />
                      </div>
                    </div>
                  );
                })}
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
