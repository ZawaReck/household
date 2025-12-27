import React, {useState} from "react";
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

    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

    const handleDeleteTransaction = (id: string) => {
        setTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
    };

    const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    // transactions配列をマップし、IDが一致する項目を更新後のデータに置き換える
    const updatedTransactions = transactions.map((transaction) =>
        transaction.id === updatedTransaction.id ? updatedTransaction : transaction
    );
    setTransactions(updatedTransactions);
    // 編集モードを終了する
    setEditingTransaction(null);
    };

    return (
    <div className="app-container">
        <h1>PWA家計簿アプリ</h1>
        <InputForm
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            editingTransaction={editingTransaction}
        setEditingTransaction={setEditingTransaction}
        />
        <hr />
        <TransactionList
            transactions={transactions}
            onDeleteTransaction={handleDeleteTransaction}
            onEditTransaction={setEditingTransaction} // 編集ボタンが押されたらStateをセット
        />
        </div>
    );
};

export default App;
