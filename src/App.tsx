import React from "react";
import { InputForm } from "./components/InputForm";
import { TransactionList } from "./components/TransactionList";
import type { Transaction } from "./types/Transaction";
import './App.css';

export const App: React.FC = () => {
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);

    const handleAddTransaction = (transaction: Omit<Transaction, "id">) => {
        const newTransaction: Transaction = {
            ...transaction,
            id: new Date().getTime().toString(),
        };
        setTransactions((prev) => [...prev, newTransaction]);
    };

    const handleDeleteTransaction = (id: string) => {
        setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
    };

    return (
        <div className="App">
            <h1>家計簿</h1>
            <InputForm onAddTransaction={handleAddTransaction} />
            <hr />
            <TransactionList
              transactions={transactions}
              onDeleteTransaction={handleDeleteTransaction}
            />
        </div>
    );
};

export default App;
