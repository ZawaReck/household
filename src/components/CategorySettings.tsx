import React from "react";
import type { Category, CategoryType } from "../types/Category";
import "./AccountSettings.css";

type Props = { categories: Category[]; onSave: (category: Category) => void };
const label: Record<CategoryType, string> = { expense: "支出", income: "収入" };

export const CategorySettings: React.FC<Props> = ({ categories, onSave }) => {
  const [type, setType] = React.useState<CategoryType>("expense");
  const [name, setName] = React.useState("");
  const add = () => {
    if (!name.trim() || categories.some((category) => category.type === type && category.name === name.trim())) return;
    const now = new Date().toISOString();
    onSave({ id: crypto.randomUUID(), name: name.trim(), type, isActive: true, createdAt: now, updatedAt: now });
    setName("");
  };
  return <section className="account-settings">
    <div className="account-settings-heading"><h2>カテゴリ</h2></div>
    <div className="account-editor">
      <label>種別<select value={type} onChange={(event) => setType(event.target.value as CategoryType)}><option value="expense">支出</option><option value="income">収入</option></select></label>
      <label>カテゴリ名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="account-editor-actions"><button type="button" onClick={add}>追加</button></div>
    </div>
    <div className="account-list">
      {categories.filter((category) => category.type === type).map((category) => <article key={category.id} className={`account-row ${category.isActive ? "" : "is-inactive"}`}><div className="account-edit"><strong>{category.name}</strong><span>{label[category.type]}</span></div><button type="button" className="account-toggle" onClick={() => onSave({ ...category, isActive: !category.isActive, updatedAt: new Date().toISOString() })}>{category.isActive ? "無効化" : "有効化"}</button></article>)}
    </div>
  </section>;
};
