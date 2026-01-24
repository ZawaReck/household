/* src/components/SummaryView.tsx */

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
            <div className="summary-top">
                <div className="summary-cell income">
                    <span className="summary-label">In</span>
                    <strong className="summary-value">{income.toLocaleString()}円</strong>
                </div>
                <div className="summary-cell out">
                    <span className="summary-label">Out</span>
                    <strong className="summary-value">{expense.toLocaleString()}円</strong>
                </div>
                <div className="summary-cell total">
                    <span className="summary-label">Total</span>
                    <strong className="summary-value">{total.toLocaleString()}円</strong>
                </div>
            </div>
            <div className="summary-bottom">
                <div className="summary-bottom-item opening">
                    <span className="summary-label">Opening:</span>
                    <strong className="summary-value">{openingBalance.toLocaleString()}円</strong>
                </div>
                <div className="summary-bottom-item balance">
                    <span className="summary-label">Balance:</span>
                    <strong className="summary-value">{balance.toLocaleString()}円</strong>
                </div>
            </div>
        </div>
    );
}
