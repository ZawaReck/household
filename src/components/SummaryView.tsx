/* src/components/SummaryView.tsx */

import React from "react";
import type { Transaction } from '../types/Transaction';
import { isIncludedInRegularAnalytics } from "../utils/analytics";
import './SummaryView.css';
import { maskedYen, useAmountMask } from "../contexts/AmountMaskContext";

interface Props {
    monthlyData: Transaction[];
    openingBalance: number;
    balance: number;
    includeExcludedAnalytics: boolean;
}

export const SummaryView: React.FC<Props> = ({ monthlyData, openingBalance, balance, includeExcludedAnalytics }) => {
    const masked = useAmountMask();
    const income = monthlyData
        .filter((transaction) => transaction.type === "income" && isIncludedInRegularAnalytics(transaction, includeExcludedAnalytics))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expense = monthlyData
        .filter((transaction) => transaction.type === "expense" && isIncludedInRegularAnalytics(transaction, includeExcludedAnalytics))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const total = income - expense;
    return (
        <div className="summary-container">
            <div className="summary-top">
                <div className="summary-cell income">
                    <span className="summary-label">In</span>
                    <strong className="summary-value">{maskedYen(income, masked)}</strong>
                </div>
                <div className="summary-cell out">
                    <span className="summary-label">Out</span>
                    <strong className="summary-value">{maskedYen(expense, masked)}</strong>
                </div>
                <div className="summary-cell total">
                    <span className="summary-label">Total</span>
                    <strong className="summary-value">{maskedYen(total, masked)}</strong>
                </div>
            </div>
            <div className="summary-bottom">
                <div className="summary-bottom-item opening">
                    <span className="summary-label">繰越金:</span>
                    <strong className="summary-value">{maskedYen(openingBalance, masked)}</strong>
                </div>
                <div className="summary-bottom-item balance">
                    <span className="summary-label">残高:</span>
                    <strong className="summary-value">{maskedYen(balance, masked)}</strong>
                </div>
            </div>
        </div>
    );
}
