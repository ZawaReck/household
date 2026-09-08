/* src/App.tsx */

import React, {useState, useEffect} from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import { InputForm } from "./components/InputForm";
import { DashboardPage } from "./components/DashboardPage";
import { GraphsPage } from "./components/GraphsPage";
import type { Transaction } from "./types/Transaction";
import { loadTransactions, saveTransactions } from "./data/transactionStore";
import type { Account } from "./types/Account";
import { loadAccounts, saveAccounts } from "./data/accountStore";
import './App.css';

export const App: React.FC = () => {

	const [transactions, setTransactions] = useState<Transaction[]>(() => {
		return loadTransactions();
	});
	const [accounts] = useState<Account[]>(() => loadAccounts());

		useEffect(() => {
			saveTransactions(transactions);
		}, [transactions]);

    useEffect(() => {
      saveAccounts(accounts);
    }, [accounts]);

		const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

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

  const [selectedDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );


	return (
		<Router>
			<div className="app-container">
      <header>
        <nav className="nav-menu">
          <Link to="/">ダッシュボード</Link>
          {/* <Link to="/add">記入</Link> */}
          <Link to="/graphs">グラフ</Link>
        </nav>
      </header>

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
