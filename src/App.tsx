/* src/App.tsx */

import React, {useState, useEffect} from "react";
import { BrowserRouter as Router, Route, Routes,
  // Link
} from "react-router-dom";
import { InputForm } from "./components/InputForm";
import { DashboardPage } from "./components/DashboardPage";
import type { Transaction } from "./types/Transaction";
import './App.css';

export const App: React.FC = () => {

	const [transactions, setTransactions] = useState<Transaction[]>(() => {
			const savedData = localStorage.getItem("transactions");
			return savedData ? JSON.parse(savedData) : [];
		});

		useEffect(() => {
			localStorage.setItem("transactions", JSON.stringify(transactions));
		}, [transactions]);

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
      {/* <header>
        <nav className="nav-menu">
          <Link to="/">ダッシュボード</Link>
          <Link to="/add">記入</Link>
        </nav>
      </header> */}

      <main>
        <Routes>
          <Route path="/" element={
            <DashboardPage
              transactions={transactions}
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
          />
        } />
        </Routes>
      </main>
    </div>
  </Router>
  );
};

export default App;
