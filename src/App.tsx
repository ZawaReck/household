/* src/App.tsx */

import React, {useState, useEffect} from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import { InputForm } from "./components/InputForm";
import { DashboardPage } from "./components/DashboardPage";
import { GraphsPage } from "./components/GraphsPage";
import { AccountSettings } from "./components/AccountSettings";
import type { Transaction } from "./types/Transaction";
import { loadTransactions, saveTransactions } from "./data/transactionStore";
import type { Account } from "./types/Account";
import { loadAccounts, saveAccounts } from "./data/accountStore";
import './App.css';

export const App: React.FC = () => {

	const [transactions, setTransactions] = useState<Transaction[]>(() => {
		return loadTransactions();
	});
	const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());

		useEffect(() => {
			saveTransactions(transactions);
		}, [transactions]);

    useEffect(() => {
      saveAccounts(accounts);
    }, [accounts]);

		const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleAddTransaction = (transaction: Omit<Transaction, "id">) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
    };
    setTransactions((prev) => [...prev, newTransaction]);
  };

	const handleDeleteTransaction = (id: string) => {
		setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
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

  const [selectedDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );


	return (
		<Router>
			<div className="app-container">
      <header>
        <nav className="nav-menu">
          <button type="button" onClick={() => setIsSettingsOpen(true)}>☰</button>
          <Link to="/">ダッシュボード</Link>
          {/* <Link to="/add">記入</Link> */}
          <Link to="/graphs">グラフ</Link>
        </nav>
      </header>

      {isSettingsOpen && (
        <div className="settings-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <aside className="settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="settings-drawer-top"><strong>設定</strong><button type="button" onClick={() => setIsSettingsOpen(false)}>×</button></div>
            <AccountSettings accounts={accounts} transactions={transactions} onSave={handleSaveAccount} />
          </aside>
        </div>
      )}

      <main>
        <Routes>
          <Route path="/" element={
            <DashboardPage
              transactions={transactions}
              accounts={accounts}
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
              monthlyData={transactions}
              accounts={accounts}
          />
        } />

        <Route path="/graphs" element={
          <GraphsPage
            transactions={transactions}
            setTransactions={setTransactions}
          />
        } />
        </Routes>
      </main>
    </div>
  </Router>
  );
};

export default App;
