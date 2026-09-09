import React from "react";
import type { Account } from "../types/Account";
import type { ScheduledMove, ScheduledMoveFrequency, ScheduledMoveRevision } from "../types/ScheduledMove";
import { localDateISO } from "../utils/date";
import "./AccountSettings.css";

type Props = { accounts: Account[]; schedules: ScheduledMove[]; onChange: (schedules: ScheduledMove[]) => void };
const today = () => localDateISO();
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return localDateISO(date); };
const emptyRevision = (accounts: Account[]): ScheduledMoveRevision => ({
  effectiveFrom: today(), source: accounts[0]?.name ?? "", destination: accounts[1]?.name ?? "",
  amount: 0, name: "積立", frequency: "monthly", executionDay: 1,
});

export const ScheduledMoveSettings: React.FC<Props> = ({ accounts, schedules, onChange }) => {
  const choices = accounts.filter((account) => account.isActive && account.kind !== "credit_card");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState<ScheduledMoveRevision>(() => emptyRevision(choices));
  const [startDate, setStartDate] = React.useState(today());

  const startNew = () => { setEditingId("new"); setStartDate(today()); setRevision(emptyRevision(choices)); };
  const startEdit = (schedule: ScheduledMove) => {
    setEditingId(schedule.id);
    setStartDate(schedule.startDate);
    setRevision({ ...schedule.revisions[schedule.revisions.length - 1] });
  };
  const save = () => {
    if (!revision.name.trim()) { window.alert("摘要を入力してください。"); return; }
    if (!revision.source || !revision.destination) { window.alert("移動元と移動先を選択してください。"); return; }
    if (revision.source === revision.destination) { window.alert("移動元と移動先には別の口座を選択してください。"); return; }
    if (!Number.isInteger(revision.amount) || revision.amount <= 0) { window.alert("金額は1円以上の整数で入力してください。"); return; }
    if (!startDate || (revision.endDate && revision.endDate < startDate)) { window.alert("終了日は開始日以降にしてください。"); return; }
    const now = new Date().toISOString();
    if (editingId === "new") {
      const id = crypto.randomUUID();
      onChange([...schedules, { id, startDate, isActive: true, activePeriods: [{ start: startDate }], revisions: [{ ...revision, effectiveFrom: startDate, name: revision.name.trim() }], skippedDates: [], createdAt: now, updatedAt: now }]);
    } else {
      onChange(schedules.map((schedule) => schedule.id === editingId ? {
        ...schedule,
        revisions: [...schedule.revisions, { ...revision, effectiveFrom: tomorrow(), name: revision.name.trim() }],
        updatedAt: now,
      } : schedule));
    }
    setEditingId(null);
  };
  const toggle = (schedule: ScheduledMove) => {
    const day = today();
    onChange(schedules.map((item) => {
      if (item.id !== schedule.id) return item;
      if (item.isActive) {
        const periods = item.activePeriods.map((period, index) => index === item.activePeriods.length - 1 && !period.end
          ? { ...period, end: (() => { const date = new Date(`${day}T00:00:00`); date.setDate(date.getDate() - 1); return localDateISO(date); })() }
          : period);
        return { ...item, isActive: false, activePeriods: periods, updatedAt: new Date().toISOString() };
      }
      return { ...item, isActive: true, activePeriods: [...item.activePeriods, { start: day }], updatedAt: new Date().toISOString() };
    }));
  };

  return <section className="account-settings">
    <div className="account-settings-heading"><h2>定期Move</h2><button type="button" onClick={startNew}>追加</button></div>
    <div className="account-list">{schedules.map((schedule) => {
      const current = schedule.revisions[schedule.revisions.length - 1];
      return <article key={schedule.id} className={`account-row ${schedule.isActive ? "" : "is-inactive"}`}>
        <button type="button" className="account-edit" onClick={() => startEdit(schedule)}><strong>{current.name}</strong><span>{current.source} → {current.destination} · {current.amount.toLocaleString()}円 · {current.frequency === "monthly" ? `毎月${current.executionDay}日` : current.frequency === "weekly" ? `毎週${["日","月","火","水","木","金","土"][current.executionDay]}曜` : "毎日"}</span></button>
        <button type="button" className="account-toggle" onClick={() => toggle(schedule)}>{schedule.isActive ? "停止" : "再開"}</button>
      </article>;
    })}</div>
    {editingId && <div className="account-editor">
      <h3>{editingId === "new" ? "定期Moveを追加" : "次回以降の設定を変更"}</h3>
      {editingId === "new" && <label>開始日<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>}
      <label>摘要<input value={revision.name} onChange={(event) => setRevision({ ...revision, name: event.target.value })} /></label>
      <label>金額<input type="number" min="1" step="1" value={revision.amount} onChange={(event) => setRevision({ ...revision, amount: Number(event.target.value) })} /></label>
      <label>移動元<select value={revision.source} onChange={(event) => setRevision({ ...revision, source: event.target.value })}>{choices.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}</select></label>
      <label>移動先<select value={revision.destination} onChange={(event) => setRevision({ ...revision, destination: event.target.value })}>{choices.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}</select></label>
      <label>頻度<select value={revision.frequency} onChange={(event) => setRevision({ ...revision, frequency: event.target.value as ScheduledMoveFrequency })}><option value="monthly">月次</option><option value="weekly">毎週</option><option value="daily">毎日</option></select></label>
      {revision.frequency !== "daily" && <label>{revision.frequency === "monthly" ? "実行日（1〜31）" : "曜日"}{revision.frequency === "monthly" ? <input type="number" min="1" max="31" value={revision.executionDay} onChange={(event) => setRevision({ ...revision, executionDay: Math.max(1, Math.min(31, Number(event.target.value))) })} /> : <select value={revision.executionDay} onChange={(event) => setRevision({ ...revision, executionDay: Number(event.target.value) })}>{["日","月","火","水","木","金","土"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select>}</label>}
      <label>終了日（任意）<input type="date" value={revision.endDate ?? ""} onChange={(event) => setRevision({ ...revision, endDate: event.target.value || undefined })} /></label>
      <div className="account-editor-actions"><button type="button" onClick={() => setEditingId(null)}>取消</button><button type="button" onClick={save}>保存</button></div>
    </div>}
  </section>;
};
