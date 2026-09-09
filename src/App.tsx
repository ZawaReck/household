/* src/App.tsx */

import React, {useState, useEffect} from "react";
import { BrowserRouter as Router, Route, Routes, NavLink } from "react-router-dom";
import { InputForm } from "./components/InputForm";
import { DashboardPage } from "./components/DashboardPage";
import { GraphsPage } from "./components/GraphsPage";
import { AccountSettings } from "./components/AccountSettings";
import { CategorySettings } from "./components/CategorySettings";
import { CsvImportSettings } from "./components/CsvImportSettings";
import { BackupSettings } from "./components/BackupSettings";
import { LogoutSettings } from "./components/LogoutSettings";
import type { Transaction } from "./types/Transaction";
import { loadTransactions, saveTransactions } from "./data/transactionStore";
import type { Account } from "./types/Account";
import { loadAccounts, saveAccounts } from "./data/accountStore";
import { reconcileCardPayments } from "./utils/cardPayments";
import type { Category } from "./types/Category";
import { loadCategories, saveCategories } from "./data/categoryStore";
import './App.css';

const DELETE_UNDO_MS = 5_000;

export const App: React.FC = () => {

	const [transactions, setTransactions] = useState<Transaction[]>(() => {
		return loadTransactions();
	});
	const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());

		useEffect(() => {
			saveTransactions(transactions);
		}, [transactions]);

    useEffect(() => {
      saveAccounts(accounts);
    }, [accounts]);
    useEffect(() => { saveCategories(categories); }, [categories]);

    useEffect(() => {
      setTransactions((current) => {
        const next = reconcileCardPayments(current, accounts);
        if (JSON.stringify(next) === JSON.stringify(current)) return current;
        return next;
      });
    }, [accounts, transactions]);

		const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [recentlyDeleted, setRecentlyDeleted] = useState<Transaction | null>(null);
    const [showFutureTransactions, setShowFutureTransactions] = useState(() =>
      localStorage.getItem("showFutureTransactions") !== "false"
    );

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const visibleTransactions = showFutureTransactions
      ? transactions
      : transactions.filter((transaction) => transaction.date <= today);

    useEffect(() => {
      localStorage.setItem("showFutureTransactions", String(showFutureTransactions));
    }, [showFutureTransactions]);

  const handleAddTransaction = (transaction: Omit<Transaction, "id">) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
    };
    setTransactions((prev) => [...prev, newTransaction]);
  };

	const handleDeleteTransaction = (id: string) => {
		const target = transactions.find((transaction) => transaction.id === id);
    if (!target) return;
    if (target.system) {
      window.alert("自動生成された記録は履歴から削除できません。関連する設定または元取引を変更してください。");
      return;
    }
    if (!target.isTaxAdjustment) setRecentlyDeleted(target);
		setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
	};

  useEffect(() => {
    if (!recentlyDeleted) return;
    const timer = window.setTimeout(() => setRecentlyDeleted(null), DELETE_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [recentlyDeleted]);

  const undoDelete = () => {
    if (!recentlyDeleted) return;
    setTransactions((current) => current.some(({ id }) => id === recentlyDeleted.id)
      ? current
      : [...current, recentlyDeleted]);
    setRecentlyDeleted(null);
  };

  const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === updatedTransaction.id ? { ...t, ...updatedTransaction } : t
      )
    );
  };

  const handleSaveAccount = (updatedAccount: Account) => {
    const previous = accounts.find((account) => account.id === updatedAccount.id);
    if (previous && previous.name !== updatedAccount.name) {
      setTransactions((current) => current.map((transaction) => ({
        ...transaction,
        source: transaction.source === previous.name ? updatedAccount.name : transaction.source,
        destination: transaction.destination === previous.name ? updatedAccount.name : transaction.destination,
      })));
    }
    setAccounts((current) => {
      const exists = current.some((account) => account.id === updatedAccount.id);
      return exists
        ? current.map((account) => account.id === updatedAccount.id ? updatedAccount : account)
        : [...current, updatedAccount];
    });
  };
  const handleSaveCategory = (updatedCategory: Category) => setCategories((current) => {
    const exists = current.some((category) => category.id === updatedCategory.id);
    return exists ? current.map((category) => category.id === updatedCategory.id ? updatedCategory : category) : [...current, updatedCategory];
  });
  const handleCsvImport = (imported: Transaction[]) => {
    setTransactions((current) => [...current, ...imported]);
  };

  const [selectedDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );


	return (
		<Router>
			<div className="app-container">
      <header>
        <nav className="nav-menu">
          <button className="settings-trigger" type="button" aria-label="設定" onClick={() => setIsSettingsOpen(true)}>☰</button>
          <NavLink to="/">入力・ダッシュボード</NavLink>
          <NavLink to="/graphs">グラフ</NavLink>
        </nav>
      </header>

      {isSettingsOpen && (
        <div className="settings-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <aside className="settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="settings-drawer-top"><strong>設定</strong><button type="button" onClick={() => setIsSettingsOpen(false)}>×</button></div>
            <AccountSettings accounts={accounts} transactions={transactions} onSave={handleSaveAccount} />
            <CategorySettings categories={categories} onSave={handleSaveCategory} />
            <section className="view-settings">
              <h2>表示</h2>
              <label>
                <input type="checkbox" checked={showFutureTransactions} onChange={(event) => setShowFutureTransactions(event.target.checked)} />
                未来の記録を表示
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
              accounts={accounts}
              categories={categories}
              onDeleteTransaction={handleDeleteTransaction}
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
              editingTransaction={editingTransaction}
              setEditingTransaction={setEditingTransaction}
              selectedDate={selectedDate}
              monthlyData={visibleTransactions}
              accounts={accounts}
              categories={categories}
          />
        } />

        <Route path="/graphs" element={
          <GraphsPage
            transactions={visibleTransactions}
            setTransactions={setTransactions}
            accounts={accounts}
          />
        } />
        </Routes>
      </main>
      <nav className="mobile-bottom-nav" aria-label="メインナビゲーション">
        <NavLink to="/add">入力</NavLink>
        <NavLink to="/">カレンダー</NavLink>
        <NavLink to="/graphs">グラフ</NavLink>
      </nav>
      <button className="mobile-settings-trigger" type="button" aria-label="設定" onClick={() => setIsSettingsOpen(true)}>☰</button>
      {recentlyDeleted && (
        <div className="undo-toast" role="status">
          <span>「{recentlyDeleted.name || recentlyDeleted.category}」を削除しました</span>
          <button type="button" onClick={undoDelete}>元に戻す</button>
        </div>
      )}
    </div>
  </Router>
  );
};

export default App;
