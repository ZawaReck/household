import React, { useState } from "react";
import  type { Transaction } from "../types/Transaction";
import { CalendarView } from "./CalendarView";
import { SummaryView} from "./SummaryView";
import { TransactionHistory } from "./TransactionHistory";
import './DashboardPage.css';

interface Props {
    transactions: Transaction[];
    onDeleteTransaction: (id: string) => void;
    onEditTransaction: (transaction: Transaction) => void;
}

export const DashboardPage: React.FC<Props> = ({ transactions, onDeleteTransaction, onEditTransaction }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    //１．今月のデータ抽出
    const monthlyData = transactions.filter((transaction) => {
        const transactionDate = new Date(transaction.date);
        return transactionDate.getFullYear() === year && transactionDate.getMonth() === month;
    });

    //2. 繰越金計算
    const openingBalance = transactions
        .filter((transaction) => new Date(transaction.date) < new Date(year, month, 1))
        .reduce((sum, transaction) => {
            if (transaction.type === "income") return sum + transaction.amount;
            if (transaction.type === "expense") return sum - transaction.amount;
            return sum;
        }, 0);

    return (
        <div className="dashboard-layout">
            <div className="dashboard-left">
                <CalendarView
                    year={year}
                    month={month}
                    monthlyData={monthlyData}
                    onMonthChange={(offset: number) => setCurrentDate(new Date(year, month + offset, 1))}
                />
                <SummaryView
                    monthlyData={monthlyData}
                    openingBalance={openingBalance}
                />
            </div>
            <div className="dashboard-right">
                <TransactionHistory
                    monthlyData={monthlyData}
                    onDeleteTransaction={onDeleteTransaction}
                    onEditTransaction={onEditTransaction}
                />
            </div>
        </div>
    );
}