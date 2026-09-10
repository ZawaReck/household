/* src/App.tsx */

import React, {useState, useEffect} from "react";
import { BrowserRouter as Router, Route, Routes, NavLink, useLocation, useNavigate } from "react-router-dom";
import { InputForm } from "./components/InputForm";
import { DashboardPage } from "./components/DashboardPage";
import { AccountSettings } from "./components/AccountSettings";
import { CategorySettings } from "./components/CategorySettings";
import { CsvImportSettings } from "./components/CsvImportSettings";
import { BackupSettings } from "./components/BackupSettings";
import { LogoutSettings } from "./components/LogoutSettings";
import { NotificationSettings } from "./components/NotificationSettings";
import { localDateISO } from "./utils/date";
import { reconcileReceiptTaxAdjustments } from "./utils/receiptTaxes";
import { ScheduledMoveSettings } from "./components/ScheduledMoveSettings";
import { recordDeletedIds, restoreDeletedId } from "./data/deletionStore";
import type { Transaction } from "./types/Transaction";
import { loadTransactions, saveTransactions } from "./data/transactionStore";
import type { Account } from "./types/Account";
import { loadAccounts, saveAccounts } from "./data/accountStore";
import { reconcileCardPayments } from "./utils/cardPayments";
import type { Category } from "./types/Category";
import { loadCategories, saveCategories } from "./data/categoryStore";
import { loadBudgets, saveBudgets } from "./data/budgetStore";
import { loadScheduledMoves, saveScheduledMoves } from "./data/scheduledMoveStore";
import { reconcileScheduledMoves } from "./utils/scheduledMoves";
import type { ScheduledMove } from "./types/ScheduledMove";
import { loadAccountActualState, saveAccountActualState } from "./data/accountActualStore";
import { reconcileMonthlyAdjustments } from "./utils/monthlyAdjustments";
import { invalidateChangedCardConfirmations } from "./utils/cardConfirmations";
import { loadInputDrafts, saveInputDrafts } from "./data/inputDraftStore";
import './App.css';
import { useSegmentedDrag } from "./hooks/useSegmentedDrag";

const GraphsPage = React.lazy(() => import("./components/GraphsPage").then((module) => ({ default: module.GraphsPage })));

const MobileBottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeIndex = pathname === "/add" ? 0 : pathname.startsWith("/graphs") ? 2 : 1;
  const drag = useSegmentedDrag<HTMLElement>({
    count: 3,
    selectedIndex: activeIndex,
    onSelect: (index) => navigate((["/add", "/", "/graphs"] as const)[index] ?? "/"),
    cssVariable: "--nav-position",
    horizontalPadding: 4,
  });
  return (
    <nav
      ref={drag.ref}
      className={`mobile-bottom-nav ${drag.isDragging ? "is-dragging" : ""}`}
      aria-label="メインナビゲーション"
      style={{ "--nav-index": activeIndex } as React.CSSProperties}
      {...drag.handlers}
    >
      <button type="button" className={activeIndex === 0 ? "active" : ""} aria-current={activeIndex === 0 ? "page" : undefined} onClick={() => navigate("/add")}>入力</button>
      <button type="button" className={activeIndex === 1 ? "active" : ""} aria-current={activeIndex === 1 ? "page" : undefined} onClick={() => navigate("/")}>カレンダー</button>
      <button type="button" className={activeIndex === 2 ? "active" : ""} aria-current={activeIndex === 2 ? "page" : undefined} onClick={() => navigate("/graphs")}>グラフ</button>
    </nav>
  );
};

export const App: React.FC = () => {

	const [transactions, setTransactions] = useState<Transaction[]>(() => {
		return loadTransactions();
	});
	const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());
  const [scheduledMoves, setScheduledMoves] = useState<ScheduledMove[]>(() => loadScheduledMoves());

		useEffect(() => {
			saveTransactions(transactions);
		}, [transactions]);

    useEffect(() => {
      saveAccounts(accounts);
    }, [accounts]);
    useEffect(() => { saveCategories(categories); }, [categories]);
    useEffect(() => { saveScheduledMoves(scheduledMoves); }, [scheduledMoves]);

    useEffect(() => {
      setTransactions((current) => {
        const next = reconcileCardPayments(current, accounts);
        if (JSON.stringify(next) === JSON.stringify(current)) return current;
        return next;
      });
    }, [accounts, transactions]);

    useEffect(() => {
      const current = loadAccountActualState();
      const next = invalidateChangedCardConfirmations(current, accounts, transactions);
      if (next !== current) saveAccountActualState(next);
    }, [accounts, transactions]);

    useEffect(() => {
      const result = reconcileScheduledMoves(transactions, scheduledMoves);
      if (result.transactions === transactions) return;
      setTransactions(result.transactions);
      setGeneratedMoveCount(result.generatedCount);
    }, [scheduledMoves, transactions]);

    useEffect(() => {
      setTransactions((current) => {
        const receiptReconciled = reconcileReceiptTaxAdjustments(current);
        const next = reconcileMonthlyAdjustments(receiptReconciled, accounts, loadAccountActualState());
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    }, [accounts, transactions]);

		const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSettingsOpening, setIsSettingsOpening] = useState(false);
    const [isSettingsClosing, setIsSettingsClosing] = useState(false);
    const settingsCloseTimer = React.useRef<number | undefined>(undefined);
    const settingsDrawerRef = React.useRef<HTMLElement>(null);
    const settingsBackdropRef = React.useRef<HTMLDivElement>(null);
    const settingsSwipe = React.useRef<{ pointerId: number; startX: number; startY: number; direction: "pending" | "horizontal" | "vertical"; offset: number } | null>(null);
    const [isSettingsDragging, setIsSettingsDragging] = useState(false);
    const [recentlyDeleted, setRecentlyDeleted] = useState<Transaction | null>(null);
    const [generatedMoveCount, setGeneratedMoveCount] = useState(0);
    const [showFutureTransactions, setShowFutureTransactions] = useState(() =>
      localStorage.getItem("showFutureTransactions") !== "false"
    );
    const [includeExcludedAnalytics, setIncludeExcludedAnalytics] = useState(() =>
      localStorage.getItem("includeExcludedAnalytics") === "true"
    );
    const [deleteUndoSeconds, setDeleteUndoSeconds] = useState(() => {
      const saved = Number(localStorage.getItem("deleteUndoSeconds") ?? 5);
      return Number.isFinite(saved) && saved >= 1 ? Math.min(saved, 60) : 5;
    });

    const openSettings = () => {
      if (settingsCloseTimer.current) window.clearTimeout(settingsCloseTimer.current);
      setIsSettingsClosing(false);
      setIsSettingsOpening(true);
      setIsSettingsOpen(true);
      settingsCloseTimer.current = window.setTimeout(() => setIsSettingsOpening(false), 140);
    };
    const closeSettings = () => {
      if (!isSettingsOpen || isSettingsClosing) return;
      setIsSettingsClosing(true);
      setIsSettingsOpening(false);
      settingsCloseTimer.current = window.setTimeout(() => {
        setIsSettingsOpen(false);
        setIsSettingsClosing(false);
      }, 140);
    };
    const handleSettingsPointerDown = (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      settingsSwipe.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, direction: "pending", offset: 0 };
    };
    const handleSettingsPointerMove = (event: React.PointerEvent<HTMLElement>) => {
      const current = settingsSwipe.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      if (current.direction === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 5) {
        current.direction = deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? "horizontal" : "vertical";
        if (current.direction === "horizontal") event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (current.direction !== "horizontal") return;
      event.preventDefault();
      current.offset = Math.max(-event.currentTarget.getBoundingClientRect().width, Math.min(0, deltaX));
      event.currentTarget.style.setProperty("--drawer-drag-x", `${current.offset}px`);
      settingsBackdropRef.current?.style.setProperty("--drawer-drag-opacity", String(Math.max(0, 1 + current.offset / event.currentTarget.getBoundingClientRect().width)));
      if (!isSettingsDragging) setIsSettingsDragging(true);
    };
    const finishSettingsDrag = (cancelled = false) => {
      const current = settingsSwipe.current;
      const drawer = settingsDrawerRef.current;
      settingsSwipe.current = null;
      if (!current || !drawer) return;
      if (drawer.hasPointerCapture(current.pointerId)) drawer.releasePointerCapture(current.pointerId);
      const shouldClose = !cancelled && current.direction === "horizontal" && current.offset < -Math.min(72, drawer.getBoundingClientRect().width * .2);
      drawer.style.transition = "transform 140ms cubic-bezier(.2, .75, .25, 1)";
      if (settingsBackdropRef.current) settingsBackdropRef.current.style.transition = "background 140ms ease-out";
      if (shouldClose) {
        drawer.style.setProperty("--drawer-drag-x", "-100%");
        settingsBackdropRef.current?.style.setProperty("--drawer-drag-opacity", "0");
        settingsCloseTimer.current = window.setTimeout(() => {
          setIsSettingsOpen(false);
          setIsSettingsDragging(false);
          drawer.style.removeProperty("--drawer-drag-x");
          drawer.style.removeProperty("transition");
          settingsBackdropRef.current?.style.removeProperty("--drawer-drag-opacity");
          settingsBackdropRef.current?.style.removeProperty("transition");
        }, 140);
        return;
      }
      drawer.style.setProperty("--drawer-drag-x", "0px");
      settingsBackdropRef.current?.style.setProperty("--drawer-drag-opacity", "1");
      window.setTimeout(() => {
        setIsSettingsDragging(false);
        drawer.style.removeProperty("--drawer-drag-x");
        drawer.style.removeProperty("transition");
        settingsBackdropRef.current?.style.removeProperty("--drawer-drag-opacity");
        settingsBackdropRef.current?.style.removeProperty("transition");
      }, 140);
    };
    useEffect(() => () => {
      if (settingsCloseTimer.current) window.clearTimeout(settingsCloseTimer.current);
    }, []);

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const visibleTransactions = showFutureTransactions
      ? transactions
      : transactions.filter((transaction) => transaction.date <= today);

    useEffect(() => {
      localStorage.setItem("showFutureTransactions", String(showFutureTransactions));
    }, [showFutureTransactions]);
    useEffect(() => {
      localStorage.setItem("includeExcludedAnalytics", String(includeExcludedAnalytics));
    }, [includeExcludedAnalytics]);
    useEffect(() => {
      localStorage.setItem("deleteUndoSeconds", String(deleteUndoSeconds));
    }, [deleteUndoSeconds]);

  const handleAddTransaction = (transaction: Omit<Transaction, "id">) => {
    const card = transaction.type === "expense"
      ? accounts.find((account) => account.kind === "credit_card" && account.name === transaction.source && account.creditCard)
      : undefined;
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      cardCycle: card?.creditCard ? {
        cardAccountId: card.id,
        closingDay: card.creditCard.closingDay,
        paymentDay: card.creditCard.paymentDay,
        paymentDelayMonths: card.creditCard.paymentDelayMonths,
      } : undefined,
    };
    setTransactions((prev) => [...prev, newTransaction]);
  };

	const handleDeleteTransaction = (id: string) => {
		const target = transactions.find((transaction) => transaction.id === id);
    if (!target) return;
    if (target.system && target.system.kind !== "scheduled_move") {
      window.alert("自動生成された記録は履歴から削除できません。関連する設定または元取引を変更してください。");
      return;
    }
    const card = accounts.find((account) => account.kind === "credit_card" && account.name === target.source);
    if (card && !window.confirm("このカード利用を削除すると、対応する自動引落Moveの金額も再計算されます。削除しますか？")) return;
    if (target.system?.kind === "scheduled_move" && target.system.scheduleId) {
      setScheduledMoves((current) => current.map((schedule) => schedule.id === target.system?.scheduleId
        ? { ...schedule, skippedDates: Array.from(new Set([...schedule.skippedDates, target.date])), updatedAt: new Date().toISOString() }
        : schedule));
    }
    if (!target.isTaxAdjustment) setRecentlyDeleted(target);
		recordDeletedIds("transactions", [target.id]);
		setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
	};

  const handleDeleteReceipt = (groupId: string): boolean => {
    const grouped = transactions.filter((transaction) => transaction.groupId === groupId);
    if (grouped.length === 0) return false;
    const includesCardUse = grouped.some((transaction) =>
      accounts.some((account) => account.kind === "credit_card" && account.name === transaction.source),
    );
    const warning = includesCardUse
      ? "\nカード利用を含むため、対応する自動引落Moveの金額も再計算されます。"
      : "";
    if (!window.confirm(`${grouped.filter((transaction) => !transaction.isTaxAdjustment).length}件の明細を含むレシート全体を削除しますか？${warning}`)) return false;
    recordDeletedIds("transactions", grouped.map((transaction) => transaction.id));
    setTransactions((current) => current.filter((transaction) => transaction.groupId !== groupId));
    return true;
  };

  useEffect(() => {
    if (!recentlyDeleted) return;
    const timer = window.setTimeout(() => setRecentlyDeleted(null), deleteUndoSeconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [deleteUndoSeconds, recentlyDeleted]);

  const undoDelete = () => {
    if (!recentlyDeleted) return;
    restoreDeletedId("transactions", recentlyDeleted.id);
    setTransactions((current) => current.some(({ id }) => id === recentlyDeleted.id)
      ? current
      : [...current, recentlyDeleted]);
    if (recentlyDeleted.system?.kind === "scheduled_move" && recentlyDeleted.system.scheduleId) {
      setScheduledMoves((current) => current.map((schedule) => schedule.id === recentlyDeleted.system?.scheduleId
        ? { ...schedule, skippedDates: schedule.skippedDates.filter((date) => date !== recentlyDeleted.date), updatedAt: new Date().toISOString() }
        : schedule));
    }
    setRecentlyDeleted(null);
  };

  const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    const card = updatedTransaction.type === "expense"
      ? accounts.find((account) => account.kind === "credit_card" && account.name === updatedTransaction.source && account.creditCard)
      : undefined;
    const previous = transactions.find((transaction) => transaction.id === updatedTransaction.id);
    const sourceChanged = previous?.source !== updatedTransaction.source;
    const withCardCycle = {
      ...updatedTransaction,
      cardCycle: card?.creditCard
        ? (!sourceChanged && updatedTransaction.cardCycle ? updatedTransaction.cardCycle : {
          cardAccountId: card.id,
          closingDay: card.creditCard.closingDay,
          paymentDay: card.creditCard.paymentDay,
          paymentDelayMonths: card.creditCard.paymentDelayMonths,
        })
        : undefined,
    };
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === updatedTransaction.id ? { ...t, ...withCardCycle, updatedAt: new Date().toISOString() } : t
      )
    );
  };

  const handleSaveAccount = (updatedAccount: Account) => {
    const previous = accounts.find((account) => account.id === updatedAccount.id);
    if (previous?.isActive && !updatedAccount.isActive) {
      const usedBySchedule = scheduledMoves.some((schedule) => {
        const revision = schedule.revisions[schedule.revisions.length - 1];
        return schedule.isActive && (revision.source === previous.name || revision.destination === previous.name);
      });
      if (usedBySchedule) {
        window.alert("有効な定期Moveで使用中の口座は無効化できません。先に定期Moveを停止または変更してください。");
        return;
      }
    }
    if (previous && previous.name !== updatedAccount.name) {
      const renamedAt = new Date().toISOString();
      setTransactions((current) => current.map((transaction) => ({
        ...transaction,
        source: transaction.source === previous.name ? updatedAccount.name : transaction.source,
        destination: transaction.destination === previous.name ? updatedAccount.name : transaction.destination,
        ...((transaction.source === previous.name || transaction.destination === previous.name) ? { updatedAt: renamedAt } : {}),
      })));
      setScheduledMoves((current) => current.map((schedule) => ({
        ...schedule,
        revisions: schedule.revisions.map((revision) => ({
          ...revision,
          source: revision.source === previous.name ? updatedAccount.name : revision.source,
          destination: revision.destination === previous.name ? updatedAccount.name : revision.destination,
        })),
        updatedAt: new Date().toISOString(),
      })));
      const actualState = loadAccountActualState();
      const byMonth = Object.fromEntries(Object.entries(actualState.byMonth).map(([month, values]) => {
        if (!(previous.name in values)) return [month, values];
        const renamed = { ...values, [updatedAccount.name]: values[previous.name] };
        delete renamed[previous.name];
        return [month, renamed];
      }));
      const confirmedByMonth = Object.fromEntries(Object.entries(actualState.confirmedByMonth).map(([month, names]) => [
        month,
        names.map((name) => name === previous.name ? updatedAccount.name : name),
      ]));
      const cardLimitByMonth = Object.fromEntries(Object.entries(actualState.cardLimitByMonth).map(([month, values]) => {
        if (!(previous.name in values)) return [month, values];
        const renamed = { ...values, [updatedAccount.name]: values[previous.name] };
        delete renamed[previous.name];
        return [month, renamed];
      }));
      saveAccountActualState({ ...actualState, byMonth, confirmedByMonth, cardLimitByMonth });
      setScheduledMoves((current) => current.map((schedule) => ({
        ...schedule,
        revisions: schedule.revisions.map((revision) => ({
          ...revision,
          source: revision.source === previous.name ? updatedAccount.name : revision.source,
          destination: revision.destination === previous.name ? updatedAccount.name : revision.destination,
        })),
        ...(schedule.revisions.some((revision) => revision.source === previous.name || revision.destination === previous.name)
          ? { updatedAt: renamedAt }
          : {}),
      })));
      saveInputDrafts(loadInputDrafts().map((draft) => {
        const changed = draft.source === previous.name || draft.sourceMove === previous.name || draft.destination === previous.name ||
          draft.receiptItems.some((item) => item.source === previous.name || item.destination === previous.name);
        if (!changed) return draft;
        return {
          ...draft,
          source: draft.source === previous.name ? updatedAccount.name : draft.source,
          sourceMove: draft.sourceMove === previous.name ? updatedAccount.name : draft.sourceMove,
          destination: draft.destination === previous.name ? updatedAccount.name : draft.destination,
          receiptItems: draft.receiptItems.map((item) => ({
          ...item,
          source: item.source === previous.name ? updatedAccount.name : item.source,
          destination: item.destination === previous.name ? updatedAccount.name : item.destination,
          })),
          updatedAt: renamedAt,
        };
      }));
    }
    setAccounts((current) => {
      const exists = current.some((account) => account.id === updatedAccount.id);
      return exists
        ? current.map((account) => account.id === updatedAccount.id ? updatedAccount : account)
        : [...current, updatedAccount];
    });
  };
  const handleSaveCategory = (updatedCategory: Category) => {
    const previous = categories.find((category) => category.id === updatedCategory.id);
    if (previous && previous.name !== updatedCategory.name) {
      const renamedAt = new Date().toISOString();
      setTransactions((current) => current.map((transaction) =>
        transaction.type === previous.type && transaction.category === previous.name
          ? { ...transaction, category: updatedCategory.name, updatedAt: renamedAt }
          : transaction
      ));
      saveBudgets(loadBudgets().map((budget) => {
        if (!(previous.name in budget.byCategory)) return budget;
        const byCategory = { ...budget.byCategory };
        const amount = byCategory[previous.name];
        delete byCategory[previous.name];
        byCategory[updatedCategory.name] = amount;
        return { ...budget, byCategory, updatedAtISO: renamedAt };
      }));
      saveInputDrafts(loadInputDrafts().map((draft) => {
        const changed = (draft.type === previous.type && draft.category === previous.name) ||
          draft.receiptItems.some((item) => item.type === previous.type && item.category === previous.name);
        if (!changed) return draft;
        return {
          ...draft,
          category: draft.type === previous.type && draft.category === previous.name ? updatedCategory.name : draft.category,
          receiptItems: draft.receiptItems.map((item) => ({
            ...item,
            category: item.type === previous.type && item.category === previous.name ? updatedCategory.name : item.category,
          })),
          updatedAt: renamedAt,
        };
      }));
    }
    setCategories((current) => {
      const exists = current.some((category) => category.id === updatedCategory.id);
      return exists ? current.map((category) => category.id === updatedCategory.id ? updatedCategory : category) : [...current, updatedCategory];
    });
  };
  const handleMergeCategory = (sourceId: string, targetId: string) => {
    const source = categories.find((category) => category.id === sourceId);
    const target = categories.find((category) => category.id === targetId);
    if (!source || !target || source.type !== target.type) return;
    const mergedAt = new Date().toISOString();
    setTransactions((current) => current.map((transaction) =>
      transaction.type === source.type && transaction.category === source.name
        ? { ...transaction, category: target.name, updatedAt: mergedAt }
        : transaction
    ));
    setCategories((current) => current.map((category) => category.id === sourceId
      ? { ...category, isActive: false, mergedIntoId: targetId, updatedAt: new Date().toISOString() }
      : category
    ));
    saveInputDrafts(loadInputDrafts().map((draft) => {
      const changed = (draft.type === source.type && draft.category === source.name) ||
        draft.receiptItems.some((item) => item.type === source.type && item.category === source.name);
      if (!changed) return draft;
      return {
        ...draft,
        category: draft.type === source.type && draft.category === source.name ? target.name : draft.category,
        receiptItems: draft.receiptItems.map((item) => ({
          ...item,
          category: item.type === source.type && item.category === source.name ? target.name : item.category,
        })),
        updatedAt: mergedAt,
      };
    }));
  };
  const handleCsvImport = (imported: Transaction[]) => {
    setTransactions((current) => {
      const existingIds = new Set(current.map((transaction) => transaction.id));
      return [...current, ...imported.filter((transaction) => !existingIds.has(transaction.id))];
    });
  };

  const [selectedDate] = React.useState(
    localDateISO()
  );


	return (
		<Router>
			<div className="app-container">
      <header>
        <nav className="nav-menu">
          <button className="settings-trigger" type="button" aria-label="設定" onClick={openSettings}>☰</button>
          <NavLink to="/">入力・ダッシュボード</NavLink>
          <NavLink to="/graphs">グラフ</NavLink>
        </nav>
      </header>

      {isSettingsOpen && (
        <div ref={settingsBackdropRef} className={`settings-backdrop ${isSettingsOpening ? "is-opening" : ""} ${isSettingsClosing ? "is-closing" : ""} ${isSettingsDragging ? "is-dragging" : ""}`} onClick={closeSettings}>
          <aside
            className="settings-drawer"
            ref={settingsDrawerRef}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handleSettingsPointerDown}
            onPointerMove={handleSettingsPointerMove}
            onPointerUp={() => finishSettingsDrag()}
            onPointerCancel={() => finishSettingsDrag(true)}
          >
            <div className="settings-drawer-top">
              <div className="settings-drawer-title"><strong>設定</strong><span className="settings-version">v{__APP_VERSION__}</span></div>
              <button type="button" onClick={closeSettings}>×</button>
            </div>
            <AccountSettings accounts={accounts} transactions={transactions} onSave={handleSaveAccount} />
            <CategorySettings categories={categories} onSave={handleSaveCategory} onMerge={handleMergeCategory} />
            <ScheduledMoveSettings accounts={accounts} schedules={scheduledMoves} onChange={setScheduledMoves} />
            <NotificationSettings />
            <section className="view-settings">
              <h2>表示</h2>
              <label>
                <input type="checkbox" checked={showFutureTransactions} onChange={(event) => setShowFutureTransactions(event.target.checked)} />
                未来の記録を表示
              </label>
              <label className="view-settings-number">
                削除の取消時間
                <input type="number" inputMode="numeric" min="1" max="60" value={deleteUndoSeconds} onChange={(event) => setDeleteUndoSeconds(Math.max(1, Math.min(60, Number(event.target.value) || 5)))} />
                秒
              </label>
            </section>
            <CsvImportSettings onImport={handleCsvImport} />
            <BackupSettings />
            <LogoutSettings />
          </aside>
        </div>
      )}

      <main>
        <Routes>
          <Route path="/" element={
            <DashboardPage
              transactions={visibleTransactions}
              showFutureTransactions={showFutureTransactions}
              onShowFutureTransactionsChange={setShowFutureTransactions}
              includeExcludedAnalytics={includeExcludedAnalytics}
              onIncludeExcludedAnalyticsChange={setIncludeExcludedAnalytics}
              accounts={accounts}
              categories={categories}
              onDeleteTransaction={handleDeleteTransaction}
              onDeleteReceipt={handleDeleteReceipt}
              onEditTransaction={(transaction) => {
                setEditingTransaction(transaction);
              }}
              onAddTransaction={handleAddTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              editingTransaction={editingTransaction}
              setEditingTransaction={setEditingTransaction}
            />
          } />

        <Route path="/add" element={
          <InputForm
              onAddTransaction={handleAddTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onDeleteReceipt={handleDeleteReceipt}
              editingTransaction={editingTransaction}
              setEditingTransaction={setEditingTransaction}
              selectedDate={selectedDate}
              monthlyData={visibleTransactions}
              accounts={accounts}
              categories={categories}
              draftScope="input"
          />
        } />

        <Route path="/graphs" element={
          <React.Suspense fallback={<div className="sync-loading">グラフを読み込んでいます…</div>}>
            <GraphsPage
              transactions={visibleTransactions}
              showFutureTransactions={showFutureTransactions}
              onShowFutureTransactionsChange={setShowFutureTransactions}
              includeExcludedAnalytics={includeExcludedAnalytics}
              onIncludeExcludedAnalyticsChange={setIncludeExcludedAnalytics}
              setTransactions={setTransactions}
              accounts={accounts}
              categories={categories}
            />
          </React.Suspense>
        } />
        </Routes>
      </main>
      <MobileBottomNav />
      <button className="mobile-settings-trigger" type="button" aria-label="設定" onClick={openSettings}>☰</button>
      {recentlyDeleted && (
        <div className="undo-toast" role="status">
          <span>「{recentlyDeleted.name || recentlyDeleted.category}」を削除しました</span>
          <button type="button" onClick={undoDelete}>元に戻す</button>
        </div>
      )}
      {generatedMoveCount > 0 && (
        <div className="auto-generated-toast" role="status">
          定期Moveを{generatedMoveCount}件追加しました
          <button type="button" aria-label="通知を閉じる" onClick={() => setGeneratedMoveCount(0)}>×</button>
        </div>
      )}
    </div>
  </Router>
  );
};

export default App;
