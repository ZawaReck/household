import React from "react";
import type { Transaction } from '../types/Transaction';
import './SummaryView.css';

interface Props {
    monthlyData: Transaction[];
    openingBalance: number;
}

export const SummaryView: React.FC<Props> = ({ monthlyData, openingBalance }) => {
    const income = monthlyData
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expense = monthlyData
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const total = income - expense;
    const balance = openingBalance + total;

    return (
        <div className="summary-container">
            <div className="summary-item income"><span>In</span><strong>{income.toLocaleString()}円</strong></div>
            <div className="summary-item expense"><span>Out</span><strong>{expense.toLocaleString()}円</strong></div>
            <div className="summary-item total"><span>Total</span><strong>{total.toLocaleString()}円</strong></div>
            <div className="summary-item opening-balance"><span>Opening</span><strong>{openingBalance.toLocaleString()}円</strong></div>
            <div className="summary-item balance"><span>Balance</span><strong>{balance.toLocaleString()}円</strong></div>
        </div>
    );
}