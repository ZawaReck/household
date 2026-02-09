/* src/components/GraphsPage.tsx */

import React from "react";
import type { Transaction } from "../types/Transaction";
import type { InvestmentAsset, InvestmentState } from "../types/Investment";
import type { BudgetEntry } from "../types/Budget";
import type { SontokuEntry } from "../types/Sontoku";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
} from "recharts";
import {
  getMonthKey,
  listMonthKeysBetween,
  monthEndISO,
  sumIncomeExpenseByMonth,
  sumExpenseByCategoryAllocatedTax,
  sumExpenseByCategoryAllocatedTaxByMonth,
  calcAccountBalancesAsOf,
} from "../utils/analytics";
import { loadInvestmentState, saveInvestmentState } from "../data/investmentStore";
import { loadBudgets, saveBudgets } from "../data/budgetStore";
import {
  loadSontokuEntries,
  upsertSontokuEntry,
  deleteSontokuEntry,
} from "../data/sontokuStore";
import {
  loadAccountActualState,
  saveAccountActualState,
} from "../data/accountActualStore";
import { PeriodFilter } from "./PeriodFilter";
import type { PeriodValue } from "./PeriodFilter";
import { CalendarView } from "./CalendarView";
import { SummaryView } from "./SummaryView";
import { daysInMonth } from "../utils/date";
import "./GraphsPage.css";

interface Props {
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
}

const chartColors = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
];

const formatYen = (value: number) => `${Math.round(value).toLocaleString()}円`;

const getMonthKeysFromTransactions = (transactions: Transaction[], fallbackMonthKey: string) => {
  if (transactions.length === 0) return [fallbackMonthKey];
  const months = Array.from(new Set(transactions.map((t) => getMonthKey(t.date))));
  months.sort();
  return months;
};

const clampDayForMonth = (monthKey: string, day: number) => {
  const [y, m] = monthKey.split("-").map((v) => Number(v));
  return Math.min(Math.max(day, 1), daysInMonth(y, m));
};

const resolvePresetRange = (preset: PeriodValue["preset"], endMonthKey: string) => {
  if (preset === "custom") return { startMonthKey: endMonthKey, endMonthKey };
  const months = Number(preset);
  const [y, m] = endMonthKey.split("-").map((v) => Number(v));
  let year = y;
  let month = m - (months - 1);
  while (month <= 0) {
    year -= 1;
    month += 12;
  }
  const startMonthKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return { startMonthKey, endMonthKey };
};

const TabPanel: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="graphs-section">
    <div className="graphs-section-header">{title}</div>
    <div className="graphs-section-body">{children}</div>
  </div>
);

export const GraphsPage: React.FC<Props> = ({ transactions, setTransactions }) => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const currentMonthKey = getMonthKey(todayISO);
  const allMonthKeys = getMonthKeysFromTransactions(transactions, currentMonthKey);

  const [investmentState, setInvestmentState] = React.useState<InvestmentState>(() =>
    loadInvestmentState()
  );

  const [portfolioMonthKey, setPortfolioMonthKey] = React.useState(currentMonthKey);
  const [accountActualState, setAccountActualState] = React.useState(() =>
    loadAccountActualState()
  );
  const [portfolioActualInputs, setPortfolioActualInputs] = React.useState<Record<string, number>>(
    {}
  );

  const [categoryMonthKey, setCategoryMonthKey] = React.useState(currentMonthKey);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");

  const [periodCategory, setPeriodCategory] = React.useState<PeriodValue>(() => {
    const preset = "6";
    const { startMonthKey, endMonthKey } = resolvePresetRange(preset, currentMonthKey);
    return { preset, startMonthKey, endMonthKey };
  });

  const [periodMonthlyNet, setPeriodMonthlyNet] = React.useState<PeriodValue>(() => {
    const preset = "12";
    const { startMonthKey, endMonthKey } = resolvePresetRange(preset, currentMonthKey);
    return { preset, startMonthKey, endMonthKey };
  });

  const [monthlyNetMode, setMonthlyNetMode] = React.useState<"income" | "expense" | "net">(
    "net"
  );
  const [selectedMonthKey, setSelectedMonthKey] = React.useState(currentMonthKey);

  const [budgetMonthKey, setBudgetMonthKey] = React.useState(currentMonthKey);
  const [budgets, setBudgets] = React.useState<BudgetEntry[]>(() => loadBudgets());
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, number>>({});

  const [sontokuEntries, setSontokuEntries] = React.useState<SontokuEntry[]>(() =>
    loadSontokuEntries()
  );
  const [sontokuMode, setSontokuMode] = React.useState<"month" | "total">("month");
  const [sontokuMonthKey, setSontokuMonthKey] = React.useState(currentMonthKey);
  const [sontokuPeriod, setSontokuPeriod] = React.useState<PeriodValue>(() => {
    const preset = "12";
    const { startMonthKey, endMonthKey } = resolvePresetRange(preset, currentMonthKey);
    return { preset, startMonthKey, endMonthKey };
  });
  const [sontokuForm, setSontokuForm] = React.useState({
    id: "",
    date: todayISO,
    kind: "gain" as "gain" | "loss",
    amount: 0,
    note: "",
  });

  const expenseCategories = React.useMemo(() => {
    const fromTx = transactions
      .filter((t) => t.type === "expense" && t.isTaxAdjustment !== true)
      .map((t) => t.category)
      .filter((c) => c && c !== "外税");
    const fromBudget = budgets.flatMap((b) => Object.keys(b.byCategory ?? {}));
    return Array.from(new Set([...fromTx, ...fromBudget])).sort();
  }, [transactions, budgets]);

  React.useEffect(() => {
    if (!selectedCategory && expenseCategories.length > 0) {
      setSelectedCategory(expenseCategories[0]);
    }
  }, [expenseCategories, selectedCategory]);

  React.useEffect(() => {
    const entry = budgets.find((b) => b.month === budgetMonthKey);
    setBudgetDraft(entry ? { ...entry.byCategory } : {});
  }, [budgetMonthKey, budgets]);

  React.useEffect(() => {
    if (periodCategory.preset === "custom") return;
    const { startMonthKey, endMonthKey } = resolvePresetRange(
      periodCategory.preset,
      periodCategory.endMonthKey
    );
    setPeriodCategory((prev) => ({
      ...prev,
      startMonthKey,
      endMonthKey,
    }));
  }, [periodCategory.preset, periodCategory.endMonthKey]);

  React.useEffect(() => {
    if (periodMonthlyNet.preset === "custom") return;
    const { startMonthKey, endMonthKey } = resolvePresetRange(
      periodMonthlyNet.preset,
      periodMonthlyNet.endMonthKey
    );
    setPeriodMonthlyNet((prev) => ({
      ...prev,
      startMonthKey,
      endMonthKey,
    }));
  }, [periodMonthlyNet.preset, periodMonthlyNet.endMonthKey]);

  React.useEffect(() => {
    if (sontokuPeriod.preset === "custom") return;
    const { startMonthKey, endMonthKey } = resolvePresetRange(
      sontokuPeriod.preset,
      sontokuPeriod.endMonthKey
    );
    setSontokuPeriod((prev) => ({
      ...prev,
      startMonthKey,
      endMonthKey,
    }));
  }, [sontokuPeriod.preset, sontokuPeriod.endMonthKey]);

  React.useEffect(() => {
    setSontokuEntries(loadSontokuEntries());
  }, []);

  React.useEffect(() => {
    setInvestmentState((prev) => {
      let changed = false;
      const current = { ...prev };
      const existingIds = new Set(current.contributions.map((c) => c.id));
      const nowMonthKey = currentMonthKey;
      current.assets.forEach((asset) => {
        if (!asset.recurring) return;
        const monthKeys = listMonthKeysBetween(asset.recurring.startMonth, nowMonthKey);
        monthKeys.forEach((month) => {
          const id = `ic_${asset.id}_${month}`;
          if (existingIds.has(id)) return;
          const day = clampDayForMonth(month, asset.recurring!.dayOfMonth);
          current.contributions.push({
            id,
            assetId: asset.id,
            month,
            date: `${month}-${String(day).padStart(2, "0")}`,
            amount: asset.recurring!.amount,
          });
          existingIds.add(id);
          changed = true;
        });
      });
      if (changed) saveInvestmentState(current);
      return current;
    });
  }, [currentMonthKey]);

  const updateInvestmentState = (next: InvestmentState) => {
    setInvestmentState(next);
    saveInvestmentState(next);
  };

  const handleAddAsset = (asset: InvestmentAsset) => {
    updateInvestmentState({
      ...investmentState,
      assets: [...investmentState.assets, asset],
    });
  };

  const handleDeleteAsset = (id: string) => {
    updateInvestmentState({
      ...investmentState,
      assets: investmentState.assets.filter((a) => a.id !== id),
      contributions: investmentState.contributions.filter((c) => c.assetId !== id),
      snapshots: investmentState.snapshots.map((s) => ({
        ...s,
        values: Object.fromEntries(
          Object.entries(s.values).filter(([key]) => key !== id)
        ),
      })),
    });
  };

  const handleSaveSnapshot = (date: string, values: Record<string, number>) => {
    const id = `is_${date}`;
    const nextSnapshots = investmentState.snapshots.some((s) => s.id === id)
      ? investmentState.snapshots.map((s) => (s.id === id ? { id, date, values } : s))
      : [...investmentState.snapshots, { id, date, values }];
    updateInvestmentState({
      ...investmentState,
      snapshots: nextSnapshots,
    });
  };

  const investmentSnapshots = [...investmentState.snapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const latestSnapshot = investmentSnapshots[investmentSnapshots.length - 1];
  const snapshotDateForTable = latestSnapshot?.date ?? todayISO;

  const investmentPrincipalByAsset = investmentState.assets.reduce<Record<string, number>>(
    (acc, asset) => {
      const base = asset.initialPrincipal ?? 0;
      const contribSum = investmentState.contributions
        .filter((c) => c.assetId === asset.id && c.date <= snapshotDateForTable)
        .reduce((sum, c) => sum + c.amount, 0);
      acc[asset.id] = base + contribSum;
      return acc;
    },
    {}
  );

  const investmentChartData = investmentSnapshots.map((snapshot) => {
    const point: Record<string, number | string> = { date: snapshot.date };
    investmentState.assets.forEach((asset) => {
      point[asset.id] = snapshot.values[asset.id] ?? 0;
    });
    return point;
  });

  const investmentProfitData = investmentSnapshots.map((snapshot) => {
    const totalValue = investmentState.assets.reduce(
      (sum, asset) => sum + (snapshot.values[asset.id] ?? 0),
      0
    );
    const totalPrincipal = investmentState.assets.reduce((sum, asset) => {
      const base = asset.initialPrincipal ?? 0;
      const contribSum = investmentState.contributions
        .filter((c) => c.assetId === asset.id && c.date <= snapshot.date)
        .reduce((s, c) => s + c.amount, 0);
      return sum + base + contribSum;
    }, 0);
    const profit = totalValue - totalPrincipal;
    const profitRate = totalPrincipal > 0 ? (profit / totalPrincipal) * 100 : 0;
    return { date: snapshot.date, profit, profitRate };
  });

  const accounts = React.useMemo(() => {
    const accs = new Set<string>();
    transactions.forEach((t) => {
      if (t.source) accs.add(t.source);
      if (t.destination) accs.add(t.destination);
    });
    return Array.from(accs).sort();
  }, [transactions]);

  const portfolioAsOf = monthEndISO(portfolioMonthKey);
  const estimatedBalances = React.useMemo(
    () => calcAccountBalancesAsOf(transactions, portfolioAsOf, accounts),
    [transactions, portfolioAsOf, accounts]
  );

  React.useEffect(() => {
    const monthActuals = accountActualState.byMonth[portfolioMonthKey] ?? {};
    const fallback: Record<string, number> = {};
    accounts.forEach((acc) => {
      fallback[acc] = monthActuals[acc] ?? estimatedBalances[acc] ?? 0;
    });
    const keys = Object.keys(fallback);
    const same =
      keys.length === Object.keys(portfolioActualInputs).length &&
      keys.every((k) => portfolioActualInputs[k] === fallback[k]);
    if (!same) setPortfolioActualInputs(fallback);
  }, [portfolioMonthKey, accountActualState, accounts, estimatedBalances, portfolioActualInputs]);

  const handlePortfolioActualChange = (account: string, value: string) => {
    setPortfolioActualInputs((prev) => ({
      ...prev,
      [account]: Number(value) || 0,
    }));
  };

  const buildAdjustmentTransaction = (
    account: string,
    monthKey: string,
    net: number
  ): Transaction => {
    const date = monthEndISO(monthKey);
    const isIncome = net > 0;
    return {
      id: `adj_${monthKey}_${account}`,
      type: isIncome ? "income" : "expense",
      amount: Math.abs(net),
      date,
      name: "差額調整",
      category: "その他",
      source: account,
      destination: "",
      memo: "差額調整",
      isSpecial: true,
    };
  };

  const applyBalanceAdjustments = (monthKey: string, actuals: Record<string, number>) => {
    const asOf = monthEndISO(monthKey);
    setTransactions((prev) => {
      const estimated = calcAccountBalancesAsOf(prev, asOf, accounts);
      const toRemove = new Set(
        prev
          .filter(
            (t) =>
              getMonthKey(t.date) === monthKey &&
              t.category === "その他" &&
              t.name === "差額調整" &&
              t.source
          )
          .map((t) => t.id)
      );
      const kept = prev.filter((t) => !toRemove.has(t.id));
      const adjustments: Transaction[] = [];
      accounts.forEach((account) => {
        const actual = Number(actuals[account] ?? 0);
        const net = actual - (estimated[account] ?? 0);
        if (net === 0) return;
        adjustments.push(buildAdjustmentTransaction(account, monthKey, net));
      });
      return [...kept, ...adjustments];
    });
  };

  const handleSavePortfolioActuals = () => {
    const nextState = {
      ...accountActualState,
      byMonth: {
        ...accountActualState.byMonth,
        [portfolioMonthKey]: { ...portfolioActualInputs },
      },
    };
    setAccountActualState(nextState);
    saveAccountActualState(nextState);
    applyBalanceAdjustments(portfolioMonthKey, portfolioActualInputs);
  };

  const portfolioPieData = accounts.map((acc) => {
    const actual = portfolioActualInputs[acc];
    const value = Number.isFinite(actual) ? actual : estimatedBalances[acc] ?? 0;
    return { name: acc, value };
  });

  const portfolioRange = listMonthKeysBetween(allMonthKeys[0], allMonthKeys[allMonthKeys.length - 1]);
  const portfolioAreaData = portfolioRange.map((month) => {
    const balances = calcAccountBalancesAsOf(transactions, monthEndISO(month), accounts);
    const point: Record<string, number | string> = { month };
    accounts.forEach((acc) => {
      point[acc] = balances[acc] ?? 0;
    });
    return point;
  });

  const categoryPieData = sumExpenseByCategoryAllocatedTax(transactions, categoryMonthKey);

  const categoryTrendMonths = listMonthKeysBetween(
    periodCategory.startMonthKey,
    periodCategory.endMonthKey
  );
  const categoryTrendData = selectedCategory
    ? sumExpenseByCategoryAllocatedTaxByMonth(transactions, categoryTrendMonths, selectedCategory)
    : [];

  const monthlyNetMonths = listMonthKeysBetween(
    periodMonthlyNet.startMonthKey,
    periodMonthlyNet.endMonthKey
  );
  const incomeExpenseSeries = sumIncomeExpenseByMonth(transactions, monthlyNetMonths);

  const selectedMonthTransactions = transactions.filter(
    (t) => getMonthKey(t.date) === selectedMonthKey
  );
  const selectedDateParts = selectedMonthKey.split("-").map((v) => Number(v));

  const budgetActuals = sumExpenseByCategoryAllocatedTax(transactions, budgetMonthKey);
  const budgetActualMap = budgetActuals.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = item.value;
    return acc;
  }, {});

  const handleSaveBudget = () => {
    const entry: BudgetEntry = {
      month: budgetMonthKey,
      byCategory: { ...budgetDraft },
      updatedAtISO: new Date().toISOString(),
    };
    const next = budgets.some((b) => b.month === budgetMonthKey)
      ? budgets.map((b) => (b.month === budgetMonthKey ? entry : b))
      : [...budgets, entry];
    setBudgets(next);
    saveBudgets(next);
  };

  const handleSubmitSontoku = (e: React.FormEvent) => {
    e.preventDefault();
    const id = sontokuForm.id || `st_${crypto.randomUUID()}`;
    const entry: SontokuEntry = {
      id,
      date: sontokuForm.date,
      kind: sontokuForm.kind,
      amount: Math.max(0, Number(sontokuForm.amount) || 0),
      note: sontokuForm.note || "",
    };
    upsertSontokuEntry(entry);
    setSontokuEntries(loadSontokuEntries());
    setSontokuForm({
      id: "",
      date: todayISO,
      kind: "gain",
      amount: 0,
      note: "",
    });
  };

  const handleEditSontoku = (entry: SontokuEntry) => {
    setSontokuForm({
      id: entry.id,
      date: entry.date,
      kind: entry.kind,
      amount: entry.amount,
      note: entry.note ?? "",
    });
  };

  const handleDeleteSontoku = (id: string) => {
    deleteSontokuEntry(id);
    setSontokuEntries(loadSontokuEntries());
    if (sontokuForm.id === id) {
      setSontokuForm({
        id: "",
        date: todayISO,
        kind: "gain",
        amount: 0,
        note: "",
      });
    }
  };

  const filteredSontokuEntries =
    sontokuMode === "month"
      ? sontokuEntries.filter((e) => getMonthKey(e.date) === sontokuMonthKey)
      : sontokuEntries.filter(
          (e) =>
            getMonthKey(e.date) >= sontokuPeriod.startMonthKey &&
            getMonthKey(e.date) <= sontokuPeriod.endMonthKey
        );

  const sontokuSummary = filteredSontokuEntries.reduce(
    (acc, entry) => {
      if (entry.kind === "gain") acc.gain += entry.amount;
      else acc.loss += entry.amount;
      acc.count += 1;
      return acc;
    },
    { gain: 0, loss: 0, count: 0 }
  );

  const sontokuDailyChartData =
    sontokuMode === "month"
      ? (() => {
          const map = new Map<string, { gain: number; loss: number }>();
          filteredSontokuEntries.forEach((entry) => {
            const key = entry.date;
            const current = map.get(key) ?? { gain: 0, loss: 0 };
            if (entry.kind === "gain") current.gain += entry.amount;
            else current.loss += entry.amount;
            map.set(key, current);
          });
          return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, values]) => ({
              date,
              gain: values.gain,
              loss: values.loss,
              net: values.gain - values.loss,
            }));
        })()
      : [];

  const sontokuMonthlyChartData =
    sontokuMode === "total"
      ? (() => {
          const monthKeys = listMonthKeysBetween(
            sontokuPeriod.startMonthKey,
            sontokuPeriod.endMonthKey
          );
          const map = new Map<string, number>();
          monthKeys.forEach((m) => map.set(m, 0));
          filteredSontokuEntries.forEach((entry) => {
            const monthKey = getMonthKey(entry.date);
            if (!map.has(monthKey)) return;
            const current = map.get(monthKey) ?? 0;
            const delta = entry.kind === "gain" ? entry.amount : -entry.amount;
            map.set(monthKey, current + delta);
          });
          return Array.from(map.entries()).map(([month, net]) => ({ month, net }));
        })()
      : [];

  const tabs = [
    { id: "invest", label: "1) 投資損益" },
    { id: "portfolio", label: "2) 全体ポートフォリオ" },
    { id: "category", label: "3) 月毎収支" },
    { id: "monthly", label: "4) 月収支推移" },
    { id: "budget", label: "5) 予算 + 損得" },
  ] as const;
  const [activeTab, setActiveTab] = React.useState<(typeof tabs)[number]["id"]>(
    "invest"
  );

  return (
    <div className="graphs-page-root">
      <h1>グラフ / 分析</h1>
      <div className="graphs-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "invest" && (
      <TabPanel title="1) 投資損益">
        <div className="section-grid">
          <div className="card">
            <h3>資産一覧</h3>
            {investmentState.assets.length === 0 ? (
              <p className="muted">資産が未登録です。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>資産</th>
                      <th>元本</th>
                      <th>現在額</th>
                      <th>損益</th>
                      <th>損益率</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentState.assets.map((asset) => {
                      const principal = investmentPrincipalByAsset[asset.id] ?? 0;
                      const current =
                        latestSnapshot?.values[asset.id] ??
                        investmentSnapshots[investmentSnapshots.length - 1]?.values[asset.id] ??
                        0;
                      const profit = current - principal;
                      const rate = principal > 0 ? (profit / principal) * 100 : 0;
                      return (
                        <tr key={asset.id}>
                          <td>{asset.name}</td>
                          <td>{formatYen(principal)}</td>
                          <td>{formatYen(current)}</td>
                          <td className={profit >= 0 ? "positive" : "negative"}>
                            {formatYen(profit)}
                          </td>
                          <td className={profit >= 0 ? "positive" : "negative"}>
                            {rate.toFixed(1)}%
                          </td>
                          <td>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => handleDeleteAsset(asset.id)}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h3>資産追加</h3>
            <AssetForm onSubmit={handleAddAsset} currentMonthKey={currentMonthKey} />
            <h3>現在額更新</h3>
            <SnapshotForm
              assets={investmentState.assets}
              defaultDate={todayISO}
              latestSnapshot={latestSnapshot}
              onSave={handleSaveSnapshot}
            />
          </div>
        </div>

        <div className="section-grid">
          <div className="card chart-card">
            <h3>積み上げ面</h3>
            {investmentChartData.length === 0 ? (
              <p className="muted">スナップショットがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={investmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Legend />
                  {investmentState.assets.map((asset, idx) => (
                    <Area
                      key={asset.id}
                      type="monotone"
                      dataKey={asset.id}
                      name={asset.name}
                      stackId="1"
                      stroke={chartColors[idx % chartColors.length]}
                      fill={chartColors[idx % chartColors.length]}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card chart-card">
            <h3>損益額 / 損益率</h3>
            {investmentProfitData.length === 0 ? (
              <p className="muted">スナップショットがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={investmentProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    formatter={(value: number, name) =>
                      name === "profitRate" ? `${value.toFixed(1)}%` : formatYen(value)
                    }
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="profit" name="損益額" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="profitRate"
                    name="損益率"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </TabPanel>
      )}

      {activeTab === "portfolio" && (
      <TabPanel title="2) 全体ポートフォリオ（口座別）">
        <div className="section-grid">
          <div className="card">
            <div className="inline-controls">
              <label>
                対象月
                <input
                  type="month"
                  value={portfolioMonthKey}
                  onChange={(e) => setPortfolioMonthKey(e.target.value)}
                />
              </label>
              <button type="button" onClick={handleSavePortfolioActuals}>
                実残高を保存して調整
              </button>
            </div>
            {accounts.length === 0 ? (
              <p className="muted">口座データがありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>口座</th>
                      <th>推定残高</th>
                      <th>実残高</th>
                      <th>差額</th>
                      <th>割合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => {
                      const estimated = estimatedBalances[account] ?? 0;
                      const actual = portfolioActualInputs[account] ?? 0;
                      const diff = actual - estimated;
                      const total = accounts.reduce(
                        (sum, acc) =>
                          sum + (portfolioActualInputs[acc] ?? estimatedBalances[acc] ?? 0),
                        0
                      );
                      const ratio = total !== 0 ? (actual / total) * 100 : 0;
                      return (
                        <tr key={account}>
                          <td>{account}</td>
                          <td>{formatYen(estimated)}</td>
                          <td>
                            <input
                              type="number"
                              value={actual}
                              onChange={(e) => handlePortfolioActualChange(account, e.target.value)}
                            />
                          </td>
                          <td className={diff >= 0 ? "positive" : "negative"}>
                            {formatYen(diff)}
                          </td>
                          <td>{ratio.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card chart-card">
            <h3>口座別構成</h3>
            {portfolioPieData.length === 0 ? (
              <p className="muted">データがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={portfolioPieData} dataKey="value" nameKey="name" outerRadius={90}>
                    {portfolioPieData.map((_, idx) => (
                      <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card chart-card">
            <h3>推定残高推移</h3>
            {portfolioAreaData.length === 0 ? (
              <p className="muted">データがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={portfolioAreaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Legend />
                  {accounts.map((account, idx) => (
                    <Area
                      key={account}
                      type="monotone"
                      dataKey={account}
                      name={account}
                      stackId="1"
                      stroke={chartColors[idx % chartColors.length]}
                      fill={chartColors[idx % chartColors.length]}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </TabPanel>
      )}

      {activeTab === "category" && (
      <TabPanel title="3) 月毎収支（カテゴリ内訳 + 推移）">
        <div className="section-grid">
          <div className="card chart-card">
            <div className="inline-controls">
              <label>
                対象月
                <input
                  type="month"
                  value={categoryMonthKey}
                  onChange={(e) => setCategoryMonthKey(e.target.value)}
                />
              </label>
            </div>
            {categoryPieData.length === 0 ? (
              <p className="muted">支出データがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={categoryPieData} dataKey="value" nameKey="category" outerRadius={90}>
                    {categoryPieData.map((_, idx) => (
                      <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card chart-card">
            <div className="inline-controls">
              <label>
                カテゴリ
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {expenseCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <PeriodFilter value={periodCategory} onChange={setPeriodCategory} />
            {categoryTrendData.length === 0 ? (
              <p className="muted">カテゴリデータがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={categoryTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Line type="monotone" dataKey="value" name={selectedCategory} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </TabPanel>
      )}

      {activeTab === "monthly" && (
      <TabPanel title="4) 月収支推移（棒グラフ + カレンダー）">
        <div className="section-grid">
          <div className="card chart-card">
            <div className="inline-controls">
              <div className="toggle-group">
                {(["income", "expense", "net"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={monthlyNetMode === mode ? "active" : ""}
                    onClick={() => setMonthlyNetMode(mode)}
                  >
                    {mode === "income" ? "収入" : mode === "expense" ? "支出" : "収支"}
                  </button>
                ))}
              </div>
            </div>
            <PeriodFilter value={periodMonthlyNet} onChange={setPeriodMonthlyNet} />
            {incomeExpenseSeries.length === 0 ? (
              <p className="muted">月次データがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={incomeExpenseSeries}
                  onClick={(state) => {
                    if (!state || !state.activeLabel) return;
                    setSelectedMonthKey(String(state.activeLabel));
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatYen(value)} />
                  <Bar
                    dataKey={monthlyNetMode}
                    name={
                      monthlyNetMode === "income"
                        ? "収入"
                        : monthlyNetMode === "expense"
                        ? "支出"
                        : "収支"
                    }
                    fill="#4E79A7"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card">
            <h3>{selectedMonthKey} のカレンダー</h3>
            <CalendarView
              year={selectedDateParts[0]}
              month={selectedDateParts[1] - 1}
              monthlyData={selectedMonthTransactions}
              onMonthChange={(offset) => {
                const [y, m] = selectedDateParts;
                let nextY = y;
                let nextM = m + offset;
                if (nextM <= 0) {
                  nextY -= 1;
                  nextM = 12;
                } else if (nextM > 12) {
                  nextY += 1;
                  nextM = 1;
                }
                const next = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}`;
                setSelectedMonthKey(next);
              }}
              onDateClick={() => {}}
            />
            <SummaryView monthlyData={selectedMonthTransactions} openingBalance={0} />
          </div>
        </div>
      </TabPanel>
      )}

      {activeTab === "budget" && (
      <TabPanel title="5) 予算（カテゴリ別） + 損得カウンター">
        <div className="section-grid">
          <div className="card">
            <h3>予算（カテゴリ別）</h3>
            <div className="inline-controls">
              <label>
                対象月
                <input
                  type="month"
                  value={budgetMonthKey}
                  onChange={(e) => setBudgetMonthKey(e.target.value)}
                />
              </label>
              <button type="button" onClick={handleSaveBudget}>
                予算を保存
              </button>
            </div>
            {expenseCategories.length === 0 ? (
              <p className="muted">カテゴリがありません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>カテゴリ</th>
                      <th>予算</th>
                      <th>実績</th>
                      <th>差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseCategories.map((category) => {
                      const actual = budgetActualMap[category] ?? 0;
                      const budget = budgetDraft[category] ?? 0;
                      const diff = budget - actual;
                      return (
                        <tr key={category}>
                          <td>{category}</td>
                          <td>
                            <input
                              type="number"
                              value={budget}
                              onChange={(e) =>
                                setBudgetDraft((prev) => ({
                                  ...prev,
                                  [category]: Number(e.target.value) || 0,
                                }))
                              }
                            />
                          </td>
                          <td>{formatYen(actual)}</td>
                          <td className={diff >= 0 ? "positive" : "negative"}>
                            {formatYen(diff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h3>損得カウンター</h3>
            <div className="inline-controls">
              <div className="toggle-group">
                <button
                  type="button"
                  className={sontokuMode === "month" ? "active" : ""}
                  onClick={() => setSontokuMode("month")}
                >
                  月毎
                </button>
                <button
                  type="button"
                  className={sontokuMode === "total" ? "active" : ""}
                  onClick={() => setSontokuMode("total")}
                >
                  累計
                </button>
              </div>
              {sontokuMode === "month" ? (
                <input
                  type="month"
                  value={sontokuMonthKey}
                  onChange={(e) => setSontokuMonthKey(e.target.value)}
                />
              ) : (
                <PeriodFilter value={sontokuPeriod} onChange={setSontokuPeriod} />
              )}
            </div>

            <div className="sontoku-cards">
              <div>
                <span>得合計</span>
                <strong>{formatYen(sontokuSummary.gain)}</strong>
              </div>
              <div>
                <span>損合計</span>
                <strong>{formatYen(sontokuSummary.loss)}</strong>
              </div>
              <div>
                <span>net</span>
                <strong className={sontokuSummary.gain - sontokuSummary.loss >= 0 ? "positive" : "negative"}>
                  {formatYen(sontokuSummary.gain - sontokuSummary.loss)}
                </strong>
              </div>
              <div>
                <span>件数</span>
                <strong>{sontokuSummary.count}</strong>
              </div>
            </div>

            <div className="chart-card">
              {sontokuMode === "month" ? (
                sontokuDailyChartData.length === 0 ? (
                  <p className="muted">損得データがありません。</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={sontokuDailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatYen(value)} />
                      <Bar dataKey="gain" name="得" fill="#59A14F" />
                      <Bar dataKey="loss" name="損" fill="#E15759" />
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : sontokuMonthlyChartData.length === 0 ? (
                <p className="muted">損得データがありません。</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={sontokuMonthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatYen(value)} />
                    <Line type="monotone" dataKey="net" name="net" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <form className="sontoku-form" onSubmit={handleSubmitSontoku}>
              <label>
                日付
                <input
                  type="date"
                  value={sontokuForm.date}
                  onChange={(e) => setSontokuForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </label>
              <div className="toggle-group">
                {(["gain", "loss"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={sontokuForm.kind === kind ? "active" : ""}
                    onClick={() => setSontokuForm((prev) => ({ ...prev, kind }))}
                  >
                    {kind === "gain" ? "得" : "損"}
                  </button>
                ))}
              </div>
              <label>
                金額
                <input
                  type="number"
                  value={sontokuForm.amount}
                  onChange={(e) =>
                    setSontokuForm((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                メモ
                <input
                  type="text"
                  value={sontokuForm.note}
                  onChange={(e) => setSontokuForm((prev) => ({ ...prev, note: e.target.value }))}
                />
              </label>
              <button type="submit">保存</button>
            </form>

            {filteredSontokuEntries.length === 0 ? (
              <p className="muted">記録がありません。</p>
            ) : (
              <ul className="sontoku-list">
                {filteredSontokuEntries
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.date}</strong>
                        <span className={entry.kind === "gain" ? "positive" : "negative"}>
                          {entry.kind === "gain" ? "得" : "損"}
                        </span>
                        <span>{formatYen(entry.amount)}</span>
                        <span>{entry.note}</span>
                      </div>
                      <div className="inline-buttons">
                        <button type="button" onClick={() => handleEditSontoku(entry)}>
                          編集
                        </button>
                        <button type="button" onClick={() => handleDeleteSontoku(entry.id)}>
                          削除
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </TabPanel>
      )}
    </div>
  );
};

const AssetForm: React.FC<{
  onSubmit: (asset: InvestmentAsset) => void;
  currentMonthKey: string;
}> = ({ onSubmit, currentMonthKey }) => {
  const [name, setName] = React.useState("");
  const [initialPrincipal, setInitialPrincipal] = React.useState(0);
  const [recurringAmount, setRecurringAmount] = React.useState(0);
  const [recurringStartMonth, setRecurringStartMonth] = React.useState(currentMonthKey);
  const [recurringDay, setRecurringDay] = React.useState(1);

  return (
    <form
      className="asset-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const asset: InvestmentAsset = {
          id: `ia_${crypto.randomUUID()}`,
          name: name.trim(),
          initialPrincipal: Number(initialPrincipal) || 0,
          ...(recurringAmount > 0
            ? {
                recurring: {
                  amount: Number(recurringAmount) || 0,
                  startMonth: recurringStartMonth,
                  dayOfMonth: Number(recurringDay) || 1,
                },
              }
            : {}),
        };
        onSubmit(asset);
        setName("");
        setInitialPrincipal(0);
        setRecurringAmount(0);
      }}
    >
      <label>
        資産名
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        初期元本
        <input
          type="number"
          value={initialPrincipal}
          onChange={(e) => setInitialPrincipal(Number(e.target.value) || 0)}
        />
      </label>
      <label>
        積立額（月）
        <input
          type="number"
          value={recurringAmount}
          onChange={(e) => setRecurringAmount(Number(e.target.value) || 0)}
        />
      </label>
      <label>
        積立開始月
        <input
          type="month"
          value={recurringStartMonth}
          onChange={(e) => setRecurringStartMonth(e.target.value)}
        />
      </label>
      <label>
        積立日
        <input
          type="number"
          value={recurringDay}
          onChange={(e) => setRecurringDay(Number(e.target.value) || 1)}
        />
      </label>
      <button type="submit">追加</button>
    </form>
  );
};

const SnapshotForm: React.FC<{
  assets: InvestmentAsset[];
  defaultDate: string;
  latestSnapshot?: { date: string; values: Record<string, number> };
  onSave: (date: string, values: Record<string, number>) => void;
}> = ({ assets, defaultDate, latestSnapshot, onSave }) => {
  const [date, setDate] = React.useState(defaultDate);
  const [values, setValues] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!latestSnapshot) return;
    setValues(latestSnapshot.values);
  }, [latestSnapshot]);

  return (
    <form
      className="snapshot-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(date, values);
      }}
    >
      <label>
        日付
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {assets.map((asset) => (
        <label key={asset.id}>
          {asset.name}
          <input
            type="number"
            value={values[asset.id] ?? 0}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [asset.id]: Number(e.target.value) || 0 }))
            }
          />
        </label>
      ))}
      <button type="submit">更新</button>
    </form>
  );
};
