export type BackupPayload = { version: 1; exportedAt: string; data: Record<string, unknown> };
const keys = ["transactions", "accounts.v1", "categories.v1", "budgets", "investments", "accountActualBalances", "sontokuEntries"];
export const buildBackup = (): BackupPayload => ({ version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(keys.map((key) => [key, JSON.parse(localStorage.getItem(key) ?? "null")])) });
export const downloadBackup = () => {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `household-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
};
