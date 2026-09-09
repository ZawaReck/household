import React from "react";
import type { Category, CategoryType } from "../types/Category";
import "./AccountSettings.css";

type Props = {
  categories: Category[];
  onSave: (category: Category) => void;
  onMerge: (sourceId: string, targetId: string) => void;
};
const label: Record<CategoryType, string> = { expense: "支出", income: "収入" };

export const CategorySettings: React.FC<Props> = ({ categories, onSave, onMerge }) => {
  const [type, setType] = React.useState<CategoryType>("expense");
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [mergeSourceId, setMergeSourceId] = React.useState("");
  const [mergeTargetId, setMergeTargetId] = React.useState("");
  const add = () => {
    if (!name.trim() || categories.some((category) => category.type === type && category.name === name.trim())) return;
    const now = new Date().toISOString();
    onSave({ id: crypto.randomUUID(), name: name.trim(), type, isActive: true, createdAt: now, updatedAt: now });
    setName("");
  };
  const saveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    if (categories.some((category) => category.id !== editing.id && category.type === editing.type && category.name === editing.name.trim())) return;
    onSave({ ...editing, name: editing.name.trim(), updatedAt: new Date().toISOString() });
    setEditing(null);
  };
  const mergeCandidates = categories.filter((category) => category.type === type && category.isActive);
  return <section className="account-settings">
    <div className="account-settings-heading"><h2>カテゴリ</h2></div>
    <div className="account-editor">
      <label>種別<select value={type} onChange={(event) => setType(event.target.value as CategoryType)}><option value="expense">支出</option><option value="income">収入</option></select></label>
      <label>カテゴリ名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="account-editor-actions"><button type="button" onClick={add}>追加</button></div>
    </div>
    <div className="account-list">
      {categories.filter((category) => category.type === type).map((category) => <article key={category.id} className={`account-row ${category.isActive ? "" : "is-inactive"}`}><button type="button" className="account-edit" onClick={() => setEditing(category)}><strong>{category.name}</strong><span>{category.mergedIntoId ? "統合済み" : label[category.type]}</span></button><button type="button" className="account-toggle" onClick={() => onSave({ ...category, isActive: !category.isActive, mergedIntoId: undefined, updatedAt: new Date().toISOString() })}>{category.isActive ? "無効化" : "有効化"}</button></article>)}
    </div>
    {editing && <div className="account-editor"><h3>名称変更</h3><label>名称<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><div className="account-editor-actions"><button type="button" onClick={() => setEditing(null)}>取消</button><button type="button" onClick={saveEdit}>保存</button></div></div>}
    <div className="account-editor">
      <h3>カテゴリ統合</h3>
      <label>統合元<select value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)}><option value="">選択</option>{mergeCandidates.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>統合先<select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}><option value="">選択</option>{mergeCandidates.filter((category) => category.id !== mergeSourceId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <div className="account-editor-actions"><button type="button" onClick={() => { if (!mergeSourceId || !mergeTargetId) return; const source = categories.find((category) => category.id === mergeSourceId); const target = categories.find((category) => category.id === mergeTargetId); if (!window.confirm(`「${source?.name}」の過去取引を「${target?.name}」へ統合しますか？`)) return; onMerge(mergeSourceId, mergeTargetId); setMergeSourceId(""); setMergeTargetId(""); }}>統合</button></div>
    </div>
  </section>;
};
