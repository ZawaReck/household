import React from "react";
import type { Transaction } from "../types/Transaction";

interface InputFormProps {
    transactions: Transaction[];
    onDeleteTransaction: (id: string) => void;
}

export const TransactionList: React.FC<InputFormProps> = ({ transactions, onDeleteTransaction }) => {
    return (
        <div>
            <h2>Transaction List</h2>
            <ul>
                {transactions.map((transaction) => (
                    <li key={transaction.id}>
                        <div>
                            <span>{transaction.date}</span>
                            <span>【{transaction.category}】</span>
                            <span>【{transaction.source}】</span>
                            <span>{transaction.memo}</span>
                            <span>{transaction.amount.toLocaleString()}円</span>
                        </div>
                        <button
                            className="delete"
                            onClick={() => {
                                if (window.confirm("本当に削除しますか？")) {
                                    onDeleteTransaction(transaction.id);
                                }
                            }}
                            >
                                削除
                            </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}