import React from "react";
import type { Transaction } from "../types/Transaction";

interface InpurtFormProps {
    onAddTransaction: (Transaction: Omit<Transaction, "id">) => void;
}

export const InputForm: React.FC<InpurtFormProps> = ({ onAddTransaction }) => {
    const [amount, setAmount] = React.useState("");
    const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [name, setName] = React.useState("");
    const [category, setCategory] = React.useState("食料品費");
    const [source, setSource] = React.useState("財布");
    const [memo, setMemo] = React.useState("");

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const newTransaction = {
            amount: Number(amount),
            date,
            name,
            category,
            source,
            memo,
            isSpecial: false, // or set this based on your logic/UI
        };

        onAddTransaction(newTransaction);
        setAmount("");
        setName("");
        setMemo("");
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
            />
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
            />
            <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="食料品費">食料品費</option>
                <option value="外食費">外食費</option>
                <option value="教養費">教養費</option>
                <option value="趣味">趣味</option>
                <option value="雑貨費">雑貨費</option>
                <option value="交通費旅費">交通費旅費</option>
                <option value="服飾費">服飾費</option>
                <option value="医療関係費">医療関係費</option>
                <option value="交際費">交際費</option>
                <option value="その他"></option>
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="財布">財布</option>
                <option value="QR">QR</option>
                <option value="IC">IC</option>
                <option value="クレカ1">クレカ1</option>
                <option value="クレカ2">クレカ2</option>
                <option value="ポイント">ポイント</option>
                <option value="その他"></option>
            </select>
            <input
                type="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Memo"
            />
            <button type="submit">保存</button>
        </form>
    );
}