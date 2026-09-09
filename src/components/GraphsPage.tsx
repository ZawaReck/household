/* src/components/GraphsPage.tsx */

import React from "react";
import type { Transaction } from "../types/Transaction";
import type { Account } from "../types/Account";
import type { Category } from "../types/Category";
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
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  getMonthKey,
  listMonthKeysBetween,
  monthEndISO,
  sumIncomeExpenseByMonth,
  sumExpenseByCategoryAllocatedTax,
  sumExpenseByCategoryAllocatedTaxByMonth,
  calcAccountBalancesAsOf,
  isIncludedInRegularAnalytics,
} from "../utils/analytics";
import { loadInvestmentState, saveInvestmentState } from "../data/investmentStore";
import { loadBudgets, saveBudgets } from "../data/budgetStore";
import { expenseCategoryOptions, incomeCategoryOptions } from "../data/categoryOptions";
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
import { accountBalanceAsOf, creditCardOutstandingAsOf } from "../utils/accountBalances";
import { localDateISO } from "../utils/date";
import "./GraphsPage.css";

interface Props {
  transactions: Transaction[];
  showFutureTransactions: boolean;
  onShowFutureTransactionsChange: (show: boolean) => void;
  includeExcludedAnalytics: boolean;
  onIncludeExcludedAnalyticsChange: (include: boolean) => void;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  accounts: Account[];
  categories: Category[];
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

const formatYen = (value: unknown) => {
  const resolved = Array.isArray(value) ? value[0] : value;
  return `${Math.round(Number(resolved ?? 0)).toLocaleString()}円`;
};
const formatYenNumber = (value: number) => `${Math.round(value).toLocaleString()}円`;
const transactionDisplayAmount = (transaction: Transaction) => {
  if (transaction.taxMode !== "exclusive") return transaction.amount;
  const rate = transaction.taxRate === 8 || transaction.taxRate === 10 ? transaction.taxRate : 0;
  return Math.floor(Number(transaction.taxBaseAmount ?? transaction.amount) * (1 + rate / 100));
};
const isAccountVisibleOn = (account: Account, date: string) =>
  account.openingDate <= date && (account.isActive || Boolean(account.disabledAt && date < account.disabledAt));

const sortByDefaultCategoryOrder = (
  items: Array<{ name: string; value: number }>,
  categoryOrder: string[]
) => {
  const orderMap = new Map(categoryOrder.map((name, index) => [name, index]));
  return [...items].sort((a, b) => {
    const aIndex = orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.name.localeCompare(b.name, "ja");
  });
};

const renderMonthlyTrendLabel = (props: any) => {
  const { x, y, width, height, value } = props;
  const resolved = Number(value ?? 0);
  if (!Number.isFinite(resolved)) return null;

  const labelX = Number(x ?? 0) + Number(width ?? 0) / 2;
  const rectTop = Number(y ?? 0);
  const rectBottom = rectTop + Number(height ?? 0);
  const zeroLineY = resolved >= 0 ? rectTop : Math.min(rectTop, rectBottom);
  const labelY = zeroLineY - 8;

  return (
    <text
      x={labelX}
      y={labelY}
      textAnchor="middle"
      fontSize={12}
      fill="#4b5a52"
    >
      {formatYenNumber(resolved)}
    </text>
  );
};

const renderCategoryPieLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, category } = props;
  if (Number(percent ?? 0) <= 0.1) return null;

  const radius =
    Number(innerRadius ?? 0) + (Number(outerRadius ?? 0) - Number(innerRadius ?? 0)) * 0.75;
  const angle = (-Number(midAngle ?? 0) * Math.PI) / 180;
  const x = Number(cx ?? 0) + radius * Math.cos(angle);
  const y = Number(cy ?? 0) + radius * Math.sin(angle);

  return (
    <text
      x={x}
      y={y}
      fill="#24332c"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={15}
      fontWeight={600}
    >
      {category}
    </text>
  );
};

const renderCategoryPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0]?.payload;
  if (!item || Number(item.percent ?? 0) > 0.1) return null;

  return <div className="pie-text-tooltip">{item.category}</div>;
};

const getNiceStep = (value: number) => {
  const safe = Math.max(value, 1);
  const exponent = Math.floor(Math.log10(safe));
  const base = 10 ** exponent;
  const normalized = safe / base;

  if (normalized <= 1) return base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
};

const getNiceMonthlyTrendScale = (values: number[]) => {
  if (values.length === 0) {
    return {
      domain: [0, 10000] as [number, number],
      ticks: [0, 5000, 10000],
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawMin = min < 0 ? min : 0;
  const rawMax = max > 0 ? max : 0;
  const range = Math.max(rawMax - rawMin, 1);
  const step = getNiceStep(range / 4);

  let domainMin = Math.floor(rawMin / step) * step;
  let domainMax = Math.ceil(rawMax / step) * step;

  if (domainMin === domainMax) {
    domainMax = domainMin + step;
  }

  const ticks: number[] = [];
  for (let tick = domainMin; tick <= domainMax; tick += step) {
    ticks.push(tick);
  }

  return {
    domain: [domainMin, domainMax] as [number, number],
    ticks,
  };
};

type MonthlyCategoryMode = "income" | "expense" | "net";
type OverviewChartMode = "pie" | MonthlyCategoryMode;
const MONTHLY_TREND_SLOT_WIDTH = 96;
const POSITIVE_BAR_COLOR = "#00C950";
const NEGATIVE_BAR_COLOR = "#FF0004";
const NET_SUMMARY_CATEGORY_NAMES = ["収入", "支出"] as const;

const getBarColorByMode = (mode: MonthlyCategoryMode, value: number) => {
  if (mode === "income") return POSITIVE_BAR_COLOR;
  if (mode === "expense") return NEGATIVE_BAR_COLOR;
  return value >= 0 ? POSITIVE_BAR_COLOR : NEGATIVE_BAR_COLOR;
};

const getMonthKeysFromTransactions = (transactions: Transaction[], fallbackMonthKey: string) => {
  if (transactions.length === 0) return [fallbackMonthKey];
  const months = Array.from(new Set(transactions.map((t) => getMonthKey(t.date))));
  months.sort();
  return months;
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

const CategoryMonthlyTrendChart: React.FC<{
  data: Array<{ month: string; value: number }>;
  category: string;
  mode: MonthlyCategoryMode;
  colorOverride?: string;
  focusMonthKey: string;
  onVisibleMonthChange?: (monthKey: string) => void;
}> = ({ data, category, mode, colorOverride, focusMonthKey, onVisibleMonthChange }) => {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const autoAlignKeyRef = React.useRef("");
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [scrollLeft, setScrollLeft] = React.useState(0);

  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateWidth = () => setViewportWidth(node.clientWidth);
    const updateScrollLeft = () => setScrollLeft(node.scrollLeft);

    updateWidth();
    updateScrollLeft();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    node.addEventListener("scroll", updateScrollLeft, { passive: true });

    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", updateScrollLeft);
    };
  }, [category]);

  const chartWidth = Math.max(viewportWidth, data.length * MONTHLY_TREND_SLOT_WIDTH);

  const visibleRange = React.useMemo(() => {
    if (data.length === 0) return { start: 0, end: 0 };

    const start = Math.max(0, Math.floor(scrollLeft / MONTHLY_TREND_SLOT_WIDTH));
    const visibleCount = Math.max(1, Math.ceil(viewportWidth / MONTHLY_TREND_SLOT_WIDTH));
    return {
      start,
      end: Math.min(data.length, start + visibleCount),
    };
  }, [data.length, scrollLeft, viewportWidth]);

  const visibleData = React.useMemo(
    () => data.slice(visibleRange.start, visibleRange.end),
    [data, visibleRange]
  );

  React.useEffect(() => {
    if (!onVisibleMonthChange || data.length === 0 || visibleRange.end <= visibleRange.start) return;

    const centerIndex = Math.min(
      data.length - 1,
      Math.floor((visibleRange.start + visibleRange.end - 1) / 2)
    );
    const visibleMonth = data[centerIndex]?.month;
    if (visibleMonth) onVisibleMonthChange(visibleMonth);
  }, [data, onVisibleMonthChange, visibleRange]);

  const scale = React.useMemo(() => {
    const target = visibleData.length > 0 ? visibleData : data;
    return getNiceMonthlyTrendScale(target.map((item) => item.value));
  }, [data, visibleData]);

  const axisWidth = React.useMemo(() => {
    const longest = Math.max(
      formatYenNumber(scale.domain[0]).length,
      formatYenNumber(scale.domain[1]).length
    );
    return Math.max(88, longest * 9 + 20);
  }, [scale.domain]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !category || data.length === 0) return;

    const autoAlignKey = `${category}:${focusMonthKey}:${data.length}`;
    if (autoAlignKeyRef.current === autoAlignKey) return;

    const targetIndex = data.findIndex((item) => item.month === focusMonthKey);
    if (targetIndex < 0) return;

    const nextScrollLeft = Math.max(
      0,
      Math.min(
        chartWidth - viewportWidth,
        (targetIndex + 1) * MONTHLY_TREND_SLOT_WIDTH - viewportWidth
      )
    );

    viewport.scrollLeft = nextScrollLeft;
    autoAlignKeyRef.current = autoAlignKey;
  }, [category, focusMonthKey, data, chartWidth, viewportWidth]);

  return (
    <div
      className="monthly-trend-chart-shell"
      style={{ gridTemplateColumns: `${axisWidth}px minmax(0, 1fr)` }}
    >
      <div className="monthly-trend-y-axis">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={data}
            margin={{ top: 24, right: 0, bottom: 0, left: 0 }}
            accessibilityLayer={false}
            tabIndex={-1}
          >
            <XAxis hide />
            <YAxis
              width={axisWidth}
              domain={scale.domain}
              ticks={scale.ticks}
              allowDataOverflow
              tickFormatter={(value) => formatYen(value)}
            />
            <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div ref={viewportRef} className="chart-scroll-viewport">
        <div className="chart-scroll-canvas" style={{ width: `${chartWidth}px` }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={data}
              barCategoryGap={24}
              margin={{ top: 24, right: 8, bottom: 0, left: 0 }}
              accessibilityLayer={false}
              tabIndex={-1}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis hide domain={scale.domain} ticks={scale.ticks} allowDataOverflow />
              <ReferenceLine y={0} stroke="#7a8b80" strokeWidth={1.5} ifOverflow="extendDomain" />
              <Bar dataKey="value" name={category} barSize={48}>
                {data.map((entry) => (
                  <Cell
                    key={`${category}-${entry.month}`}
                    fill={colorOverride ?? getBarColorByMode(mode, entry.value)}
                  />
                ))}
                <LabelList dataKey="value" content={renderMonthlyTrendLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export const GraphsPage: React.FC<Props> = ({ transactions, showFutureTransactions, onShowFutureTransactionsChange, includeExcludedAnalytics, onIncludeExcludedAnalyticsChange, setTransactions, accounts: accountMaster, categories }) => {
  const todayISO = localDateISO();
  const currentMonthKey = getMonthKey(todayISO);
  const allMonthKeys = getMonthKeysFromTransactions(transactions, currentMonthKey);
  const currentYear = currentMonthKey.slice(0, 4);
  const allYears = Array.from(new Set(allMonthKeys.map((month) => month.slice(0, 4)))).sort();

  const [investmentState, setInvestmentState] = React.useState<InvestmentState>(() =>
    loadInvestmentState()
  );
  const [investmentChartMode, setInvestmentChartMode] = React.useState<"area" | "profit" | "pie">("area");
  const [investmentPeriodMonths, setInvestmentPeriodMonths] = React.useState<"3" | "6" | "12" | "all">("12");

  const [portfolioMonthKey, setPortfolioMonthKey] = React.useState(() => {
    const requested = new URLSearchParams(window.location.search).get("month") ?? "";
    return /^\d{4}-\d{2}$/.test(requested) ? requested : currentMonthKey;
  });
  const [portfolioBalanceDate, setPortfolioBalanceDate] = React.useState(todayISO);
  const [accountActualState, setAccountActualState] = React.useState(() =>
    loadAccountActualState()
  );
  const [portfolioActualInputs, setPortfolioActualInputs] = React.useState<Record<string, number>>(
    {}
  );
  const [cardAvailableInputs, setCardAvailableInputs] = React.useState<Record<string, number>>({});
  const [includePendingCardPayments, setIncludePendingCardPayments] = React.useState(false);
  const [portfolioChartMode, setPortfolioChartMode] = React.useState<"pie" | "stacked">("pie");

  const [categoryMonthKey, setCategoryMonthKey] = React.useState(currentMonthKey);
  const [monthlyCategoryMode, setMonthlyCategoryMode] =
    React.useState<MonthlyCategoryMode>("expense");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");

  const [yearlyCategoryYear, setYearlyCategoryYear] = React.useState(currentYear);
  const [yearlyCategoryMode, setYearlyCategoryMode] =
    React.useState<MonthlyCategoryMode>("expense");
  const [selectedYearlyCategory, setSelectedYearlyCategory] = React.useState<string>("");
  const [yearlyOverviewMode, setYearlyOverviewMode] =
    React.useState<OverviewChartMode>("pie");
  const [yearlyChartAnchorMonthKey, setYearlyChartAnchorMonthKey] = React.useState(currentMonthKey);

  const [budgetMonthKey, setBudgetMonthKey] = React.useState(currentMonthKey);
  const [budgets, setBudgets] = React.useState<BudgetEntry[]>(() => loadBudgets());
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, number>>({});
  const [budgetApplyEndMonth, setBudgetApplyEndMonth] = React.useState(currentMonthKey);

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

  const inactiveExpenseCategoryNames = React.useMemo(() => new Set(
    categories
      .filter((category) => category.type === "expense" && !category.isActive)
      .map((category) => category.name)
  ), [categories]);

  const expenseCategories = React.useMemo(() => {
    const fromTx = transactions
      .filter((t) => t.type === "expense" && t.isTaxAdjustment !== true && isIncludedInRegularAnalytics(t, includeExcludedAnalytics))
      .map((t) => t.category)
      .filter((c) => c && c !== "外税" && !inactiveExpenseCategoryNames.has(c));
    const activeMaster = categories
      .filter((category) => category.type === "expense" && category.isActive)
      .map((category) => category.name);
    const unique = Array.from(new Set([...activeMaster, ...fromTx]));
    return sortByDefaultCategoryOrder(unique.map((name) => ({ name, value: 0 })), expenseCategoryOptions)
      .map((item) => item.name);
  }, [transactions, categories, inactiveExpenseCategoryNames, includeExcludedAnalytics]);

  React.useEffect(() => {
    const entry = budgets.find((b) => b.month === budgetMonthKey);
    const inherited = [...budgets]
      .filter((budget) => budget.month < budgetMonthKey)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const source = entry?.byCategory ?? inherited?.byCategory ?? {};
    setBudgetDraft(Object.fromEntries(
      Object.entries(source).filter(([category]) => !inactiveExpenseCategoryNames.has(category))
    ));
    setBudgetApplyEndMonth((current) => current < budgetMonthKey ? budgetMonthKey : current);
  }, [budgetMonthKey, budgets, inactiveExpenseCategoryNames]);

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

  const updateInvestmentState = (next: InvestmentState) => {
    setInvestmentState(next);
    saveInvestmentState(next);
  };

  const investmentAccounts = React.useMemo(
    () => accountMaster.filter((account) => account.isActive && account.kind === "investment"),
    [accountMaster],
  );
  const investmentAssets: InvestmentAsset[] = React.useMemo(() => investmentAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    initialPrincipal: account.openingBalance - (account.initialProfit ?? 0),
    openingValue: account.openingBalance,
  })), [investmentAccounts]);

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

  const investmentSnapshots = React.useMemo(() => [...investmentState.snapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  ), [investmentState.snapshots]);
  const latestSnapshot = investmentSnapshots[investmentSnapshots.length - 1];
  const snapshotDateForTable = latestSnapshot?.date ?? todayISO;

  const investmentFlows = (account: Account, date: string) => {
    if (date < account.openingDate) return { deposits: 0, withdrawals: 0, cumulativeDeposits: 0 };
    let deposits = 0;
    let withdrawals = 0;
    transactions.forEach((transaction) => {
      if (transaction.type !== "move" || transaction.date <= account.openingDate || transaction.date > date) return;
      if (transaction.destination === account.name) deposits += transaction.amount;
      if (transaction.source === account.name) withdrawals += transaction.amount;
    });
    const initialPrincipal = account.openingBalance - (account.initialProfit ?? 0);
    return { deposits, withdrawals, cumulativeDeposits: initialPrincipal + deposits };
  };

  const investmentChartData = investmentSnapshots.map((snapshot) => {
    const point: Record<string, number | string> = { date: snapshot.date };
    investmentAssets.forEach((asset) => {
      const account = investmentAccounts.find((item) => item.id === asset.id);
      point[asset.id] = account && snapshot.date >= account.openingDate
        ? snapshot.values[asset.id] ?? account.openingBalance
        : 0;
    });
    return point;
  });

  const investmentProfitData = investmentSnapshots.map((snapshot) => {
    const totalValue = investmentAssets.reduce(
      (sum, asset) => {
        const account = investmentAccounts.find((item) => item.id === asset.id);
        if (!account || snapshot.date < account.openingDate) return sum;
        return sum + (snapshot.values[asset.id] ?? account.openingBalance);
      },
      0
    );
    const totals = investmentAccounts.reduce((acc, account) => {
      const flow = investmentFlows(account, snapshot.date);
      acc.deposits += flow.cumulativeDeposits;
      acc.withdrawals += flow.withdrawals;
      return acc;
    }, { deposits: 0, withdrawals: 0 });
    const profit = totalValue + totals.withdrawals - totals.deposits;
    const profitRate = totals.deposits > 0 ? (profit / totals.deposits) * 100 : null;
    return { date: snapshot.date, profit, profitRate };
  });
  const investmentPeriodStart = React.useMemo(() => {
    if (investmentPeriodMonths === "all" || !latestSnapshot) return "";
    const date = new Date(`${latestSnapshot.date}T00:00:00`);
    date.setMonth(date.getMonth() - Number(investmentPeriodMonths));
    return localDateISO(date);
  }, [investmentPeriodMonths, latestSnapshot]);
  const filteredInvestmentChartData = investmentChartData.filter((point) => !investmentPeriodStart || String(point.date) >= investmentPeriodStart);
  const filteredInvestmentProfitData = investmentProfitData.filter((point) => !investmentPeriodStart || point.date >= investmentPeriodStart);
  const investmentPieData = investmentAssets.map((asset) => ({ name: asset.name, value: latestSnapshot?.values[asset.id] ?? 0 }));
  const latestInvestmentTotal = investmentPieData.reduce((sum, asset) => sum + asset.value, 0);

  const regularAccountNames = React.useMemo(() => {
    const accs = new Set<string>();
    const cardNames = new Set(
      accountMaster.filter((account) => account.kind === "credit_card").map((account) => account.name)
    );
    const investmentNames = new Set(
      accountMaster.filter((account) => account.kind === "investment").map((account) => account.name)
    );
    const masterNames = new Set(accountMaster.map((account) => account.name));
    accountMaster
      .filter((account) => isAccountVisibleOn(account, portfolioBalanceDate) && account.kind !== "credit_card" && account.kind !== "investment")
      .forEach((account) => accs.add(account.name));
    transactions.forEach((t) => {
      if (t.source && !masterNames.has(t.source) && !cardNames.has(t.source) && !investmentNames.has(t.source)) accs.add(t.source);
      if (t.destination && !masterNames.has(t.destination) && !cardNames.has(t.destination) && !investmentNames.has(t.destination)) accs.add(t.destination);
    });
    return Array.from(accs).sort();
  }, [transactions, accountMaster, portfolioBalanceDate]);
  const portfolioInvestmentAccounts = React.useMemo(
    () => accountMaster.filter((account) => account.kind === "investment" && isAccountVisibleOn(account, portfolioBalanceDate)),
    [accountMaster, portfolioBalanceDate],
  );
  const accountNames = React.useMemo(
    () => [...regularAccountNames, ...portfolioInvestmentAccounts.map((account) => account.name)],
    [regularAccountNames, portfolioInvestmentAccounts]
  );
  const calcRegularBalances = React.useCallback((items: Transaction[], asOf: string) => {
    const fallback = calcAccountBalancesAsOf(items, asOf, regularAccountNames);
    return Object.fromEntries(regularAccountNames.map((name) => {
      const account = accountMaster.find((item) => item.name === name && item.kind !== "credit_card" && item.kind !== "investment");
      return [name, account ? accountBalanceAsOf(account, items, asOf) : (fallback[name] ?? 0)];
    }));
  }, [accountMaster, regularAccountNames]);

  const portfolioAsOf = monthEndISO(portfolioMonthKey);
  React.useEffect(() => {
    const saved = accountActualState.basisDateByMonth[portfolioMonthKey];
    setPortfolioBalanceDate(saved ?? (portfolioMonthKey === currentMonthKey ? todayISO : portfolioAsOf));
  }, [accountActualState.basisDateByMonth, currentMonthKey, portfolioAsOf, portfolioMonthKey, todayISO]);
  const estimatedBalances = React.useMemo(
    () => calcRegularBalances(transactions, portfolioBalanceDate),
    [transactions, portfolioBalanceDate, calcRegularBalances]
  );
  const investmentValuesForPortfolio = React.useMemo(() => {
    const latestAtOrBefore = [...investmentSnapshots]
      .filter((snapshot) => snapshot.date <= portfolioBalanceDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return Object.fromEntries(portfolioInvestmentAccounts.map((account) => [
      account.name,
      latestAtOrBefore?.values[account.id] ?? account.openingBalance,
    ]));
  }, [portfolioInvestmentAccounts, investmentSnapshots, portfolioBalanceDate]);
  const displayedEstimatedBalances = React.useMemo(
    () => ({ ...estimatedBalances, ...investmentValuesForPortfolio }),
    [estimatedBalances, investmentValuesForPortfolio]
  );
  const activeCardAccounts = React.useMemo(() => accountMaster.filter(
    (account) => account.isActive && account.kind === "credit_card" && account.creditCard
  ), [accountMaster]);
  const cardStatuses = React.useMemo(() => activeCardAccounts.map((account) => {
    const used = creditCardOutstandingAsOf(account, transactions, portfolioBalanceDate);
    return { account, used, available: (account.creditCard?.limit ?? 0) - used };
  }), [activeCardAccounts, portfolioBalanceDate, transactions]);
  const cardMonthConfirmed = cardStatuses.length > 0 && cardStatuses.every(({ account, available }) =>
    (accountActualState.confirmedByMonth[portfolioMonthKey] ?? []).includes(account.name) &&
    accountActualState.byMonth[portfolioMonthKey]?.[account.name] === available
  );

  React.useEffect(() => {
    const monthActuals = accountActualState.byMonth[portfolioMonthKey] ?? {};
    const fallback: Record<string, number> = {};
    accountNames.forEach((acc) => {
      fallback[acc] = investmentValuesForPortfolio[acc] ?? monthActuals[acc] ?? estimatedBalances[acc] ?? 0;
    });
    const keys = Object.keys(fallback);
    const same =
      keys.length === Object.keys(portfolioActualInputs).length &&
      keys.every((k) => portfolioActualInputs[k] === fallback[k]);
    if (!same) setPortfolioActualInputs(fallback);
  }, [portfolioMonthKey, accountActualState, accountNames, estimatedBalances, investmentValuesForPortfolio, portfolioActualInputs]);

  React.useEffect(() => {
    const saved = accountActualState.byMonth[portfolioMonthKey] ?? {};
    setCardAvailableInputs(Object.fromEntries(cardStatuses.map(({ account, available }) => [
      account.name,
      saved[account.name] ?? available,
    ])));
  }, [portfolioMonthKey, accountActualState, cardStatuses]);

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
      name: "不明金",
      category: "その他",
      source: account,
      destination: "",
      memo: "月末実残高照合による自動調整",
      isSpecial: false,
      classification: "normal",
      system: { kind: "monthly_adjustment", key: `${monthKey}:${account}` },
    };
  };

  const applyBalanceAdjustments = (monthKey: string, actuals: Record<string, number>, basisDate: string) => {
    setTransactions((prev) => {
      const toRemove = new Set(
        prev
          .filter(
            (t) =>
              t.system?.kind === "monthly_adjustment" &&
              getMonthKey(t.date) === monthKey
          )
          .map((t) => t.id)
      );
      const kept = prev.filter((t) => !toRemove.has(t.id));
      const estimated = calcRegularBalances(kept, basisDate);
      const adjustments: Transaction[] = [];
      regularAccountNames.forEach((account) => {
        const actual = Number(actuals[account] ?? 0);
        const net = actual - (estimated[account] ?? 0);
        if (net === 0) return;
        adjustments.push(buildAdjustmentTransaction(account, monthKey, net));
      });
      return [...kept, ...adjustments];
    });
  };

  const handleSavePortfolioActuals = () => {
    const regularActuals = Object.fromEntries(
      regularAccountNames.map((account) => [account, portfolioActualInputs[account] ?? 0])
    );
    const isMonthEndUpdate = portfolioBalanceDate === portfolioAsOf;
    if (isMonthEndUpdate) {
      const mismatched = cardStatuses.find(({ account, available }) => cardAvailableInputs[account.name] !== available);
      if (mismatched) {
        window.alert(`${mismatched.account.name}の実利用可能額と計算値が一致していません。利用記録を修正してください。`);
        return;
      }
    }
    const previousConfirmed = accountActualState.confirmedByMonth[portfolioMonthKey] ?? [];
    const confirmedNames = isMonthEndUpdate
      ? [...regularAccountNames, ...cardStatuses.map(({ account }) => account.name)]
      : [];
    const nextState = {
      ...accountActualState,
      byMonth: {
        ...accountActualState.byMonth,
        [portfolioMonthKey]: {
          ...(accountActualState.byMonth[portfolioMonthKey] ?? {}),
          ...regularActuals,
          ...(isMonthEndUpdate ? cardAvailableInputs : {}),
        },
      },
      confirmedByMonth: {
        ...accountActualState.confirmedByMonth,
        [portfolioMonthKey]: isMonthEndUpdate ? Array.from(new Set([...previousConfirmed, ...confirmedNames])) : previousConfirmed,
      },
      basisDateByMonth: { ...accountActualState.basisDateByMonth, [portfolioMonthKey]: portfolioBalanceDate },
    };
    setAccountActualState(nextState);
    saveAccountActualState(nextState);
    applyBalanceAdjustments(portfolioMonthKey, regularActuals, portfolioBalanceDate);
    handleSaveSnapshot(
      portfolioBalanceDate,
      Object.fromEntries(portfolioInvestmentAccounts.map((account) => [account.id, portfolioActualInputs[account.name] ?? account.openingBalance]))
    );
  };

  const handleConfirmCards = () => {
    const mismatched = cardStatuses.find(({ account, available }) => cardAvailableInputs[account.name] !== available);
    if (mismatched) {
      window.alert(`${mismatched.account.name}の実利用可能額と計算値が一致していません。利用記録を修正してください。`);
      return;
    }
    const confirmed = new Set(accountActualState.confirmedByMonth[portfolioMonthKey] ?? []);
    cardStatuses.forEach(({ account }) => confirmed.add(account.name));
    const nextState = {
      ...accountActualState,
      byMonth: {
        ...accountActualState.byMonth,
        [portfolioMonthKey]: {
          ...(accountActualState.byMonth[portfolioMonthKey] ?? {}),
          ...cardAvailableInputs,
        },
      },
      confirmedByMonth: {
        ...accountActualState.confirmedByMonth,
        [portfolioMonthKey]: Array.from(confirmed),
      },
    };
    setAccountActualState(nextState);
    saveAccountActualState(nextState);
  };

  const pendingCardTotal = (asOf: string) => activeCardAccounts.reduce((cardTotal, card) => {
      const outstanding = creditCardOutstandingAsOf(card, transactions, asOf);
      return cardTotal + Math.max(0, outstanding);
    }, 0);

  const portfolioDisplayValues = Object.fromEntries(accountNames.map((account) => [
    account,
    portfolioActualInputs[account] ?? displayedEstimatedBalances[account] ?? 0,
  ]));
  const portfolioAssetTotal = Object.values(portfolioDisplayValues).reduce((sum, value) => sum + value, 0);
  const selectedPendingCardTotal = includePendingCardPayments ? pendingCardTotal(portfolioBalanceDate) : 0;

  const portfolioPieData = accountNames.map((acc) => {
    return { name: acc, value: portfolioDisplayValues[acc] ?? 0 };
  });

  const portfolioMonths = Array.from(new Set([
    ...allMonthKeys,
    ...investmentSnapshots.map((snapshot) => getMonthKey(snapshot.date)),
  ])).sort();
  const portfolioRange = listMonthKeysBetween(portfolioMonths[0], portfolioMonths[portfolioMonths.length - 1]);
  const portfolioAreaData = portfolioRange.map((month) => {
    const asOf = monthEndISO(month);
    const balances = calcRegularBalances(transactions, asOf);
    const snapshot = [...investmentSnapshots]
      .filter((item) => item.date <= asOf)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    portfolioInvestmentAccounts.forEach((account) => {
      balances[account.name] = isAccountVisibleOn(account, asOf)
        ? snapshot?.values[account.id] ?? account.openingBalance
        : 0;
    });
    const point: Record<string, number | string> = { month };
    accountNames.forEach((acc) => {
      const master = accountMaster.find((account) => account.name === acc);
      point[acc] = master && !isAccountVisibleOn(master, asOf) ? 0 : balances[acc] ?? 0;
    });
    return point;
  });
  const selectedInvestmentSnapshotIsExact = portfolioInvestmentAccounts.length === 0 || investmentSnapshots.some((snapshot) => snapshot.date === portfolioAsOf);

  const monthlyCategorySummary = React.useMemo(() => {
    if (monthlyCategoryMode === "expense") {
      const items = sortByDefaultCategoryOrder(
        sumExpenseByCategoryAllocatedTax(transactions, categoryMonthKey, includeExcludedAnalytics).map((item) => ({
          name: item.category,
          value: item.value,
        })),
        expenseCategoryOptions
      );
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { items, total };
    }

    if (monthlyCategoryMode === "income") {
      const monthTx = transactions.filter((t) => getMonthKey(t.date) === categoryMonthKey);
      const categoryMap = new Map<string, number>();
      monthTx
        .filter((t) => t.type === "income" && isIncludedInRegularAnalytics(t, includeExcludedAnalytics))
        .forEach((t) => {
          const key = t.category || "未分類";
          categoryMap.set(key, (categoryMap.get(key) ?? 0) + t.amount);
        });
      const items = sortByDefaultCategoryOrder(
        Array.from(categoryMap.entries())
          .map(([name, value]) => ({ name, value }))
          .filter((item) => item.value !== 0),
        incomeCategoryOptions
      );
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { items, total };
    }

    const monthSeries = sumIncomeExpenseByMonth(transactions, [categoryMonthKey], includeExcludedAnalytics)[0] ?? {
      month: categoryMonthKey,
      income: 0,
      expense: 0,
      net: 0,
    };
    const items = [
      { name: "収入", value: monthSeries.income },
      { name: "支出", value: -monthSeries.expense },
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return { items, total };
  }, [transactions, categoryMonthKey, monthlyCategoryMode, includeExcludedAnalytics]);

  React.useEffect(() => {
    if (monthlyCategorySummary.items.length === 0) {
      if (selectedCategory) setSelectedCategory("");
      return;
    }
    if (
      selectedCategory &&
      monthlyCategorySummary.items.some((item) => item.name === selectedCategory)
    ) {
      return;
    }
    setSelectedCategory("");
  }, [monthlyCategorySummary.items, selectedCategory]);

  const categoryTrendMonths = listMonthKeysBetween(allMonthKeys[0], allMonthKeys[allMonthKeys.length - 1]);
  const handleVisibleYearSync = React.useCallback((monthKey: string) => {
    const nextYear = monthKey.slice(0, 4);
    setYearlyCategoryYear((prev) => (prev === nextYear ? prev : nextYear));
  }, []);
  const categoryTrendData = selectedCategory
    ? categoryTrendMonths.map((month) => {
        if (monthlyCategoryMode === "expense") {
          const found = sumExpenseByCategoryAllocatedTaxByMonth(
            transactions,
            [month],
            selectedCategory,
            includeExcludedAnalytics,
          )[0];
          return { month, value: found?.value ?? 0 };
        }

        if (monthlyCategoryMode === "income") {
          const monthTx = transactions.filter((t) => getMonthKey(t.date) === month);
          const value = monthTx
            .filter((t) => t.type === "income" && isIncludedInRegularAnalytics(t, includeExcludedAnalytics) && (t.category || "未分類") === selectedCategory)
            .reduce((sum, t) => sum + t.amount, 0);
          return { month, value };
        }

        const totals = sumIncomeExpenseByMonth(transactions, [month], includeExcludedAnalytics)[0] ?? {
          month,
          income: 0,
          expense: 0,
          net: 0,
        };
        return {
          month,
          value: selectedCategory === "収入" ? totals.income : -totals.expense,
        };
      })
    : [];

  const categoryPieTotal = monthlyCategorySummary.items
    .filter((item) => item.value > 0)
    .reduce((sum, item) => sum + item.value, 0);
  const categoryPieData = monthlyCategorySummary.items
    .filter((item) => item.value > 0)
    .map((item) => ({
      category: item.name,
      value: item.value,
      percent: categoryPieTotal > 0 ? item.value / categoryPieTotal : 0,
    }));
  const selectedCategoryColor = React.useMemo(() => {
    const colorIndex = categoryPieData.findIndex((item) => item.category === selectedCategory);
    if (colorIndex >= 0) return chartColors[colorIndex % chartColors.length];

    const fallbackIndex = monthlyCategorySummary.items.findIndex(
      (item) => item.name === selectedCategory
    );
    return chartColors[(fallbackIndex >= 0 ? fallbackIndex : 0) % chartColors.length];
  }, [categoryPieData, monthlyCategorySummary.items, selectedCategory]);
  const monthlyCategoryColorMap = React.useMemo(() => {
    if (monthlyCategoryMode === "net") {
      return new Map<string, string>([
        ["収入", POSITIVE_BAR_COLOR],
        ["支出", NEGATIVE_BAR_COLOR],
      ]);
    }
    const entries = monthlyCategorySummary.items.map((item, index) => [
      item.name,
      chartColors[index % chartColors.length],
    ] as const);
    return new Map(entries);
  }, [monthlyCategoryMode, monthlyCategorySummary.items]);
  const canRenderCategoryPie =
    selectedCategory === "" &&
    categoryPieData.length > 0 &&
    monthlyCategorySummary.items.every((item) => item.value > 0);
  const monthlyCategoryTransactions = selectedCategory
    ? transactions
        .filter((transaction) => {
          if (getMonthKey(transaction.date) !== categoryMonthKey || transaction.isTaxAdjustment) return false;
          if (!isIncludedInRegularAnalytics(transaction, includeExcludedAnalytics)) return false;
          if (monthlyCategoryMode === "net") return transaction.type === (selectedCategory === "収入" ? "income" : "expense");
          return transaction.type === monthlyCategoryMode && (transaction.category || "未分類") === selectedCategory;
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const yearlyTrendMonths = React.useMemo(
    () => listMonthKeysBetween(`${yearlyCategoryYear}-01`, `${yearlyCategoryYear}-12`),
    [yearlyCategoryYear]
  );
  const yearlyTransactions = React.useMemo(
    () => transactions.filter((t) => t.date.startsWith(`${yearlyCategoryYear}-`)),
    [transactions, yearlyCategoryYear]
  );

  const yearlyCategorySummary = React.useMemo(() => {
    if (yearlyCategoryMode === "expense") {
      const items = sortByDefaultCategoryOrder(
        yearlyTrendMonths.flatMap((month) =>
          sumExpenseByCategoryAllocatedTax(transactions, month, includeExcludedAnalytics).map((item) => ({
            name: item.category,
            value: item.value,
          }))
        ).reduce<Array<{ name: string; value: number }>>((acc, item) => {
          const found = acc.find((entry) => entry.name === item.name);
          if (found) found.value += item.value;
          else acc.push({ ...item });
          return acc;
        }, []),
        expenseCategoryOptions
      );
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { items, total };
    }

    if (yearlyCategoryMode === "income") {
      const categoryMap = new Map<string, number>();
      yearlyTransactions
        .filter((t) => t.type === "income" && isIncludedInRegularAnalytics(t, includeExcludedAnalytics))
        .forEach((t) => {
          const key = t.category || "未分類";
          categoryMap.set(key, (categoryMap.get(key) ?? 0) + t.amount);
        });
      const items = sortByDefaultCategoryOrder(
        Array.from(categoryMap.entries())
          .map(([name, value]) => ({ name, value }))
          .filter((item) => item.value !== 0),
        incomeCategoryOptions
      );
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { items, total };
    }

    const yearSeries = sumIncomeExpenseByMonth(transactions, yearlyTrendMonths, includeExcludedAnalytics);
    const incomeTotal = yearSeries.reduce((sum, item) => sum + item.income, 0);
    const expenseTotal = yearSeries.reduce((sum, item) => sum + item.expense, 0);
    const items = [
      { name: "収入", value: incomeTotal },
      { name: "支出", value: -expenseTotal },
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return { items, total };
  }, [transactions, yearlyTransactions, yearlyTrendMonths, yearlyCategoryMode, includeExcludedAnalytics]);

  React.useEffect(() => {
    if (yearlyCategorySummary.items.length === 0) {
      if (selectedYearlyCategory) setSelectedYearlyCategory("");
      return;
    }
    if (
      selectedYearlyCategory &&
      yearlyCategorySummary.items.some((item) => item.name === selectedYearlyCategory)
    ) {
      return;
    }
    setSelectedYearlyCategory("");
  }, [yearlyCategorySummary.items, selectedYearlyCategory]);

  const yearlyCategoryTrendData = selectedYearlyCategory
    ? categoryTrendMonths.map((month) => {
        if (yearlyCategoryMode === "expense") {
          const found = sumExpenseByCategoryAllocatedTaxByMonth(
            transactions,
            [month],
            selectedYearlyCategory,
            includeExcludedAnalytics,
          )[0];
          return { month, value: found?.value ?? 0 };
        }

        if (yearlyCategoryMode === "income") {
          const monthTx = transactions.filter((t) => getMonthKey(t.date) === month);
          const value = monthTx
            .filter((t) => t.type === "income" && isIncludedInRegularAnalytics(t, includeExcludedAnalytics) && (t.category || "未分類") === selectedYearlyCategory)
            .reduce((sum, t) => sum + t.amount, 0);
          return { month, value };
        }

        const totals = sumIncomeExpenseByMonth(transactions, [month], includeExcludedAnalytics)[0] ?? {
          month,
          income: 0,
          expense: 0,
          net: 0,
        };
        return {
          month,
          value: selectedYearlyCategory === "収入" ? totals.income : -totals.expense,
        };
      })
    : [];

  const yearlyPieTotal = yearlyCategorySummary.items
    .filter((item) => item.value > 0)
    .reduce((sum, item) => sum + item.value, 0);
  const yearlyPieData = yearlyCategorySummary.items
    .filter((item) => item.value > 0)
    .map((item) => ({
      category: item.name,
      value: item.value,
      percent: yearlyPieTotal > 0 ? item.value / yearlyPieTotal : 0,
    }));
  const selectedYearlyCategoryColor = React.useMemo(() => {
    const colorIndex = yearlyPieData.findIndex((item) => item.category === selectedYearlyCategory);
    if (colorIndex >= 0) return chartColors[colorIndex % chartColors.length];

    const fallbackIndex = yearlyCategorySummary.items.findIndex(
      (item) => item.name === selectedYearlyCategory
    );
    return chartColors[(fallbackIndex >= 0 ? fallbackIndex : 0) % chartColors.length];
  }, [yearlyPieData, yearlyCategorySummary.items, selectedYearlyCategory]);
  const yearlyCategoryColorMap = React.useMemo(() => {
    if (yearlyCategoryMode === "net") {
      return new Map<string, string>([
        ["収入", POSITIVE_BAR_COLOR],
        ["支出", NEGATIVE_BAR_COLOR],
      ]);
    }
    const entries = yearlyCategorySummary.items.map((item, index) => [
      item.name,
      chartColors[index % chartColors.length],
    ] as const);
    return new Map(entries);
  }, [yearlyCategoryMode, yearlyCategorySummary.items]);
  const canRenderYearlyPie =
    selectedYearlyCategory === "" &&
    yearlyPieData.length > 0 &&
    yearlyCategorySummary.items.every((item) => item.value > 0);
  const yearlyOverviewSeries = sumIncomeExpenseByMonth(transactions, categoryTrendMonths, includeExcludedAnalytics);
  const yearlyCategoryTransactions = selectedYearlyCategory
    ? yearlyTransactions
        .filter((transaction) => {
          if (transaction.isTaxAdjustment || !isIncludedInRegularAnalytics(transaction, includeExcludedAnalytics)) return false;
          if (yearlyCategoryMode === "net") return transaction.type === (selectedYearlyCategory === "収入" ? "income" : "expense");
          return transaction.type === yearlyCategoryMode && (transaction.category || "未分類") === selectedYearlyCategory;
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const renderCategoryTransactions = (items: Transaction[], title: string) => (
    <div className="card category-transaction-card">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="muted">該当する取引はありません。</p> : <div className="table-wrap">
        <table>
          <thead><tr><th>日付</th><th>摘要</th><th>カテゴリ</th><th>口座</th><th>金額</th></tr></thead>
          <tbody>{items.map((transaction) => <tr key={transaction.id}>
            <td>{transaction.date}</td>
            <td>{transaction.name}</td>
            <td>{transaction.category}</td>
            <td>{transaction.source}</td>
            <td className={transaction.type === "income" ? "positive" : "negative"}>
              {transaction.type === "income" ? "+" : "−"}{formatYen(transactionDisplayAmount(transaction))}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  );

  React.useEffect(() => {
    if (monthlyCategoryMode !== "net") return;
    if (selectedCategory && !NET_SUMMARY_CATEGORY_NAMES.includes(selectedCategory as typeof NET_SUMMARY_CATEGORY_NAMES[number])) {
      setSelectedCategory("");
    }
  }, [monthlyCategoryMode, selectedCategory]);

  React.useEffect(() => {
    if (yearlyCategoryMode !== "net") return;
    if (yearlyOverviewMode === "pie") {
      setYearlyOverviewMode("net");
    }
    if (
      selectedYearlyCategory &&
      !NET_SUMMARY_CATEGORY_NAMES.includes(
        selectedYearlyCategory as typeof NET_SUMMARY_CATEGORY_NAMES[number]
      )
    ) {
      setSelectedYearlyCategory("");
    }
  }, [yearlyCategoryMode, yearlyOverviewMode, selectedYearlyCategory]);

  const budgetActuals = sumExpenseByCategoryAllocatedTax(transactions, budgetMonthKey);
  const budgetActualMap = budgetActuals.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = item.value;
    return acc;
  }, {});

  const handleSaveBudget = () => {
    const existing = budgets.find((budget) => budget.month === budgetMonthKey);
    const inactiveHistory = Object.fromEntries(
      Object.entries(existing?.byCategory ?? {}).filter(([category]) => inactiveExpenseCategoryNames.has(category))
    );
    const entry: BudgetEntry = {
      month: budgetMonthKey,
      byCategory: { ...inactiveHistory, ...budgetDraft },
      updatedAtISO: new Date().toISOString(),
    };
    const next = budgets.some((b) => b.month === budgetMonthKey)
      ? budgets.map((b) => (b.month === budgetMonthKey ? entry : b))
      : [...budgets, entry];
    setBudgets(next);
    saveBudgets(next);
  };

  const handleApplyBudgetRange = () => {
    if (budgetApplyEndMonth < budgetMonthKey) {
      window.alert("終了月は開始月以降を選択してください。");
      return;
    }
    const months = listMonthKeysBetween(budgetMonthKey, budgetApplyEndMonth);
    if (!window.confirm(`${budgetMonthKey}〜${budgetApplyEndMonth}（${months.length}か月）の既存予算を上書きしますか？`)) return;
    const now = new Date().toISOString();
    const byMonth = new Map(budgets.map((budget) => [budget.month, budget]));
    months.forEach((month) => {
      const existing = byMonth.get(month);
      const inactiveHistory = Object.fromEntries(
        Object.entries(existing?.byCategory ?? {}).filter(([category]) => inactiveExpenseCategoryNames.has(category))
      );
      byMonth.set(month, { month, byCategory: { ...inactiveHistory, ...budgetDraft }, updatedAtISO: now });
    });
    const next = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
    setBudgets(next);
    saveBudgets(next);
  };

  const configuredBudgetEntries = Object.entries(budgetDraft).filter(([, value]) => value > 0);
  const totalBudget = configuredBudgetEntries.reduce((sum, [, value]) => sum + value, 0);
  const totalBudgetActual = Object.values(budgetActualMap).reduce((sum, value) => sum + value, 0);
  const totalBudgetRate = totalBudget > 0 ? (totalBudgetActual / totalBudget) * 100 : null;

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
    { id: "category", label: "1) 月毎収支" },
    { id: "monthly", label: "2) 収支推移" },
    { id: "portfolio", label: "3) ポートフォリオ" },
    { id: "invest", label: "4) 投資損益" },
    { id: "budget", label: "5) 予算&損得" },
  ] as const;
  const [activeTab, setActiveTab] = React.useState<(typeof tabs)[number]["id"]>(
    () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      return tabs.some((tab) => tab.id === requested)
        ? requested as (typeof tabs)[number]["id"]
        : "category";
    }
  );

  return (
    <div className="graphs-page-root">
      <div className="graphs-topbar">
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
        <button
          type="button"
          className={`future-toggle ${showFutureTransactions ? "active" : ""}`}
          aria-pressed={showFutureTransactions}
          onClick={() => onShowFutureTransactionsChange(!showFutureTransactions)}
        >
          未来の記録 {showFutureTransactions ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          className={`future-toggle ${includeExcludedAnalytics ? "active" : ""}`}
          aria-pressed={includeExcludedAnalytics}
          onClick={() => onIncludeExcludedAnalyticsChange(!includeExcludedAnalytics)}
        >
          通算・特別 {includeExcludedAnalytics ? "含む" : "除外"}
        </button>
      </div>

      {activeTab === "invest" && (
      <TabPanel title="4) 投資損益">
        <div className="section-grid">
          <div className="card">
            <h3>資産一覧</h3>
            {investmentAccounts.length === 0 ? (
              <p className="muted">設定で投資口座を登録してください。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>資産</th>
                      <th>累計入金</th>
                      <th>累計出金</th>
                      <th>現在額</th>
                      <th>損益</th>
                      <th>損益率</th>
                      <th>構成比</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentAccounts.map((account) => {
                      const flow = investmentFlows(account, snapshotDateForTable);
                      const current = latestSnapshot?.values[account.id] ?? account.openingBalance;
                      const profit = current + flow.withdrawals - flow.cumulativeDeposits;
                      const rate = flow.cumulativeDeposits > 0 ? (profit / flow.cumulativeDeposits) * 100 : null;
                      return (
                        <tr key={account.id}>
                          <td>{account.name}</td>
                          <td>{formatYen(flow.cumulativeDeposits)}</td>
                          <td>{formatYen(flow.withdrawals)}</td>
                          <td>{formatYen(current)}</td>
                          <td className={profit >= 0 ? "positive" : "negative"}>
                            {formatYen(profit)}
                          </td>
                          <td className={profit >= 0 ? "positive" : "negative"}>
                            {rate == null ? "—" : `${rate.toFixed(1)}%`}
                          </td>
                          <td>{latestInvestmentTotal !== 0 ? `${((current / latestInvestmentTotal) * 100).toFixed(1)}%` : "—"}</td>
                          <td />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <p className="muted">投資口座の追加・開始残高・開始時点損益は設定から変更します。入出金はMoveから自動集計します。</p>
            <h3>現在額更新</h3>
            <SnapshotForm
              assets={investmentAssets}
              defaultDate={todayISO}
              snapshots={investmentSnapshots}
              onSave={handleSaveSnapshot}
            />
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-header-actions"><h3>{investmentChartMode === "area" ? "評価額推移" : investmentChartMode === "profit" ? "損益額 / 損益率" : "現在構成"}</h3><div className="toggle-group"><button type="button" className={investmentChartMode === "area" ? "active" : ""} onClick={() => setInvestmentChartMode("area")}>積上</button><button type="button" className={investmentChartMode === "profit" ? "active" : ""} onClick={() => setInvestmentChartMode("profit")}>損益</button><button type="button" className={investmentChartMode === "pie" ? "active" : ""} onClick={() => setInvestmentChartMode("pie")}>円</button></div></div>
          {investmentChartMode !== "pie" && <div className="toggle-group investment-period-control">{([['3','3か月'],['6','6か月'],['12','1年'],['all','全期間']] as const).map(([value, label]) => <button key={value} type="button" className={investmentPeriodMonths === value ? "active" : ""} onClick={() => setInvestmentPeriodMonths(value)}>{label}</button>)}</div>}
          {investmentChartMode === "area" ? (
            filteredInvestmentChartData.length === 0 ? (
              <p className="muted">スナップショットがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={filteredInvestmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatYen(value)} />
                  <Legend />
                  {investmentAssets.map((asset, idx) => (
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
            )
          ) : investmentChartMode === "profit" ? (
            filteredInvestmentProfitData.length === 0 ? (
              <p className="muted">スナップショットがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={filteredInvestmentProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "損益率"
                        ? value == null ? "—" : `${Number(value).toFixed(1)}%`
                        : formatYen(value)
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
            )
          ) : !latestSnapshot ? <p className="muted">スナップショットがありません。</p> : (
            <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={investmentPieData} dataKey="value" nameKey="name" outerRadius={95}>{investmentPieData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => formatYen(value)} /><Legend /></PieChart></ResponsiveContainer>
          )}
        </div>
      </TabPanel>
      )}

      {activeTab === "portfolio" && (
      <TabPanel title="3) ポートフォリオ（口座別）">
        <div className="section-grid">
          <div className="card">
            <div className="inline-controls">
              <label>
                対象月
                <input
                  type="month"
                  max={currentMonthKey}
                  value={portfolioMonthKey}
                  onChange={(e) => setPortfolioMonthKey(e.target.value)}
                />
              </label>
              <label>
                残高基準日
                <input type="date" min={`${portfolioMonthKey}-01`} max={portfolioMonthKey === currentMonthKey ? todayISO : portfolioAsOf} value={portfolioBalanceDate} onChange={(event) => setPortfolioBalanceDate(event.target.value)} />
              </label>
              <button type="button" onClick={handleSavePortfolioActuals}>
                {portfolioBalanceDate === portfolioAsOf ? "全口座の月末残高を確定" : "この日の残高を更新"}
              </button>
              <label><input type="checkbox" checked={includePendingCardPayments} onChange={(event) => setIncludePendingCardPayments(event.target.checked)} />カード引落予定を差し引く</label>
            </div>
            {!selectedInvestmentSnapshotIsExact && <p className="muted">投資口座は直近の評価額を仮表示しています。この月を確定すると月末評価額として保存されます。</p>}
            <div className="budget-total-card">
              <div><strong>総資産</strong><span>{formatYen(portfolioAssetTotal - selectedPendingCardTotal)}</span></div>
              {includePendingCardPayments && <div className="muted"><span>カード引落予定額</span><span>−{formatYen(selectedPendingCardTotal)}</span></div>}
            </div>
            {accountNames.length === 0 ? (
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
                    {accountNames.map((account) => {
                      const estimated = displayedEstimatedBalances[account] ?? 0;
                      const actual = portfolioActualInputs[account] ?? 0;
                      const diff = actual - estimated;
                      const displayed = portfolioDisplayValues[account] ?? actual;
                      const ratio = portfolioAssetTotal !== 0 ? (displayed / portfolioAssetTotal) * 100 : 0;
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
          <div className="card">
            <h3>クレジットカード月末確認</h3>
            {portfolioBalanceDate !== portfolioAsOf ? <p className="muted">カードの確認済み操作は月末日の更新時に行えます。</p> : cardStatuses.length === 0 ? <p className="muted">有効なカードがありません。</p> : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>カード</th><th>利用額</th><th>計算利用可能額</th><th>実利用可能額</th></tr></thead>
                    <tbody>{cardStatuses.map(({ account, used, available }) => (
                      <tr key={account.id}>
                        <td>{account.name}</td><td>{formatYen(used)}</td><td>{formatYen(available)}</td>
                        <td><input type="number" value={cardAvailableInputs[account.name] ?? available} onChange={(event) => setCardAvailableInputs((current) => ({ ...current, [account.name]: Number(event.target.value) }))} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <button type="button" onClick={handleConfirmCards}>{cardMonthConfirmed ? "確認済み" : "カード残高を確認済みにする"}</button>
              </>
            )}
          </div>
          <div className="card chart-card">
            <div className="chart-header-actions"><h3>{portfolioChartMode === "pie" ? "口座別構成" : "口座別残高推移"}</h3><div className="toggle-group"><button type="button" className={portfolioChartMode === "pie" ? "active" : ""} onClick={() => setPortfolioChartMode("pie")}>円</button><button type="button" className={portfolioChartMode === "stacked" ? "active" : ""} onClick={() => setPortfolioChartMode("stacked")}>積上</button></div></div>
            {portfolioPieData.length === 0 ? (
              <p className="muted">データがありません。</p>
            ) : portfolioChartMode === "pie" ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={portfolioPieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {portfolioPieData.map((_, idx) => (
                      <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatYen(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={portfolioAreaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatYen(value)} />
                  <Legend />
                  {accountNames.map((account, idx) => (
                    <Bar
                      key={account}
                      dataKey={account}
                      name={account}
                      stackId="1"
                      fill={chartColors[idx % chartColors.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </TabPanel>
      )}

      {activeTab === "category" && (
      <TabPanel title="1) 月毎収支（カテゴリ内訳 + 推移）">
        <div className="monthly-category-layout">
          <div className="card monthly-category-sidebar">
            <div className="inline-controls monthly-category-toolbar">
              <div className="toggle-group">
                {(["income", "expense", "net"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={monthlyCategoryMode === mode ? "active" : ""}
                    onClick={() => setMonthlyCategoryMode(mode)}
                  >
                    {mode === "income" ? "収入" : mode === "expense" ? "支出" : "収支"}
                  </button>
                ))}
              </div>
              <label>
                対象月
                <input
                  type="month"
                  value={categoryMonthKey}
                  onChange={(e) => setCategoryMonthKey(e.target.value)}
                />
              </label>
            </div>

            <button
              type="button"
              className={`monthly-category-row monthly-category-total${
                selectedCategory === "" ? " active" : ""
              }`}
              onClick={() => setSelectedCategory("")}
            >
              <span className="monthly-category-name">total</span>
              <span
                className={`monthly-category-value${
                  monthlyCategorySummary.total < 0 ? " negative" : ""
                }`}
              >
                {formatYen(monthlyCategorySummary.total)}
              </span>
            </button>
            <div className="monthly-category-divider" />

            <div className="monthly-category-list">
              {monthlyCategorySummary.items.length === 0 ? (
                <p className="muted">対象データがありません。</p>
              ) : (
                monthlyCategorySummary.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`monthly-category-row${
                      selectedCategory === item.name ? " active" : ""
                    }`}
                    onClick={() => setSelectedCategory(item.name)}
                  >
                    <span className="monthly-category-name">
                      <span
                        className="monthly-category-dot"
                        style={{ color: monthlyCategoryColorMap.get(item.name) ?? chartColors[0] }}
                        aria-hidden="true"
                      >
                        ●
                      </span>
                      {item.name}
                    </span>
                    <span
                      className={`monthly-category-value${item.value < 0 ? " negative" : ""}`}
                    >
                      {formatYen(item.value)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="card chart-card monthly-category-chart">
            {selectedCategory ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>{selectedCategory} の月推移</h3>
                    <p className="muted">{categoryTrendMonths[0]} から {categoryTrendMonths[categoryTrendMonths.length - 1]}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedCategory("")}>
                    {monthlyCategoryMode === "net" ? "収支グラフに戻す" : "円グラフに戻す"}
                  </button>
                </div>
                {categoryTrendData.length === 0 ? (
                  <p className="muted">カテゴリデータがありません。</p>
                ) : (
                  <CategoryMonthlyTrendChart
                    data={categoryTrendData}
                    category={selectedCategory}
                    mode={monthlyCategoryMode}
                    colorOverride={selectedCategoryColor}
                    focusMonthKey={categoryMonthKey}
                  />
                )}
              </>
            ) : canRenderCategoryPie ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>カテゴリ内訳</h3>
                    <p className="muted">左のカテゴリ名を押すと月推移を表示します。</p>
                  </div>
                </div>
                <div className="pie-chart-wrap">
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        dataKey="value"
                        nameKey="category"
                        outerRadius={110}
                        startAngle={90}
                        endAngle={-270}
                        labelLine={false}
                        label={renderCategoryPieLabel}
                      >
                        {categoryPieData.map((_, idx) => (
                          <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={false}
                        content={renderCategoryPieTooltip}
                        isAnimationActive={false}
                        wrapperStyle={{ outline: "none" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : monthlyCategorySummary.items.length === 0 ? (
              <p className="muted">対象データがありません。</p>
            ) : monthlyCategoryMode === "net" ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>月毎収支</h3>
                    <p className="muted">
                      {categoryTrendMonths[0]} から {categoryTrendMonths[categoryTrendMonths.length - 1]} を月別に表示します。
                    </p>
                  </div>
                </div>
                <CategoryMonthlyTrendChart
                  data={yearlyOverviewSeries.map((item) => ({
                    month: item.month,
                    value: item.net,
                  }))}
                  category="収支"
                  mode="net"
                  focusMonthKey={categoryMonthKey}
                />
              </>
            ) : (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>カテゴリ内訳</h3>
                    <p className="muted">
                      収支には負の値が含まれるため、円グラフの代わりにカテゴリ棒グラフを表示しています。
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={monthlyCategorySummary.items.map((item) => ({
                      category: item.name,
                      value: item.value,
                    }))}
                    layout="vertical"
                    margin={{ left: 16, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="category" width={96} />
                    <Tooltip formatter={(value) => formatYen(value)} />
                    <Bar dataKey="value">
                      {monthlyCategorySummary.items.map((item) => (
                        <Cell
                          key={item.name}
                          fill={getBarColorByMode(monthlyCategoryMode, item.value)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>
        {selectedCategory && renderCategoryTransactions(monthlyCategoryTransactions, `${categoryMonthKey} ${selectedCategory} の取引明細`)}
      </TabPanel>
      )}

      {activeTab === "monthly" && (
      <TabPanel title="2) 収支推移（年合計 + 月推移）">
        <div className="monthly-category-layout">
          <div className="card monthly-category-sidebar">
            <div className="inline-controls monthly-category-toolbar">
              <div className="toggle-group">
                {(["income", "expense", "net"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={yearlyCategoryMode === mode ? "active" : ""}
                    onClick={() => setYearlyCategoryMode(mode)}
                  >
                    {mode === "income" ? "収入" : mode === "expense" ? "支出" : "収支"}
                  </button>
                ))}
              </div>
              <label>
                対象年
                <select
                  value={yearlyCategoryYear}
                  onChange={(e) => {
                    const nextYear = e.target.value;
                    setYearlyCategoryYear(nextYear);
                    setYearlyChartAnchorMonthKey(`${nextYear}-12`);
                  }}
                >
                  {allYears.map((year) => (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className={`monthly-category-row monthly-category-total${
                selectedYearlyCategory === "" ? " active" : ""
              }`}
              onClick={() => setSelectedYearlyCategory("")}
            >
              <span className="monthly-category-name">total</span>
              <span
                className={`monthly-category-value${
                  yearlyCategorySummary.total < 0 ? " negative" : ""
                }`}
              >
                {formatYen(yearlyCategorySummary.total)}
              </span>
            </button>
            <div className="monthly-category-divider" />

            <div className="monthly-category-list">
              {yearlyCategorySummary.items.length === 0 ? (
                <p className="muted">対象データがありません。</p>
              ) : (
                yearlyCategorySummary.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`monthly-category-row${
                      selectedYearlyCategory === item.name ? " active" : ""
                    }`}
                    onClick={() => setSelectedYearlyCategory(item.name)}
                  >
                    <span className="monthly-category-name">
                      <span
                        className="monthly-category-dot"
                        style={{ color: yearlyCategoryColorMap.get(item.name) ?? chartColors[0] }}
                        aria-hidden="true"
                      >
                        ●
                      </span>
                      {item.name}
                    </span>
                    <span
                      className={`monthly-category-value${item.value < 0 ? " negative" : ""}`}
                    >
                      {formatYen(item.value)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="card chart-card monthly-category-chart">
            {selectedYearlyCategory ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>{selectedYearlyCategory} の月推移</h3>
                    <p className="muted">{categoryTrendMonths[0]} から {categoryTrendMonths[categoryTrendMonths.length - 1]}</p>
                  </div>
                  <div className="chart-header-actions">
                    <div className="toggle-group">
                      {([
                        { key: "pie", label: "円グラフ" },
                        { key: "income", label: "収入" },
                        { key: "expense", label: "支出" },
                        { key: "net", label: "収支" },
                      ] as const).map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={yearlyOverviewMode === option.key ? "active" : ""}
                          disabled={option.key === "pie" && yearlyCategoryMode === "net"}
                          onClick={() => {
                            if (option.key === "pie" && yearlyCategoryMode === "net") return;
                            setSelectedYearlyCategory("");
                            setYearlyOverviewMode(option.key);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setSelectedYearlyCategory("")}>
                      年内訳に戻す
                    </button>
                  </div>
                </div>
                {yearlyCategoryTrendData.length === 0 ? (
                  <p className="muted">カテゴリデータがありません。</p>
                ) : (
                  <CategoryMonthlyTrendChart
                    data={yearlyCategoryTrendData}
                    category={selectedYearlyCategory}
                    mode={yearlyCategoryMode}
                    colorOverride={selectedYearlyCategoryColor}
                    focusMonthKey={yearlyChartAnchorMonthKey}
                    onVisibleMonthChange={handleVisibleYearSync}
                  />
                )}
              </>
            ) : yearlyOverviewMode === "pie" && canRenderYearlyPie ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>{yearlyCategoryYear}年のカテゴリ内訳</h3>
                    <p className="muted">左のカテゴリ名を押すと月推移を表示します。</p>
                  </div>
                  <div className="toggle-group">
                    {([
                      { key: "pie", label: "円グラフ" },
                      { key: "income", label: "収入" },
                      { key: "expense", label: "支出" },
                      { key: "net", label: "収支" },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={yearlyOverviewMode === option.key ? "active" : ""}
                        disabled={option.key === "pie" && yearlyCategoryMode === "net"}
                        onClick={() => {
                          if (option.key === "pie" && yearlyCategoryMode === "net") return;
                          setYearlyOverviewMode(option.key);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pie-chart-wrap">
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={yearlyPieData}
                        dataKey="value"
                        nameKey="category"
                        outerRadius={110}
                        startAngle={90}
                        endAngle={-270}
                        labelLine={false}
                        label={renderCategoryPieLabel}
                      >
                        {yearlyPieData.map((_, idx) => (
                          <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={false}
                        content={renderCategoryPieTooltip}
                        isAnimationActive={false}
                        wrapperStyle={{ outline: "none" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : yearlyOverviewMode === "pie" && yearlyCategorySummary.items.length > 0 ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>{yearlyCategoryYear}年のカテゴリ内訳</h3>
                    <p className="muted">
                      収支には負の値が含まれるため、円グラフの代わりにカテゴリ棒グラフを表示しています。
                    </p>
                  </div>
                  <div className="toggle-group">
                    {([
                      { key: "pie", label: "円グラフ" },
                      { key: "income", label: "収入" },
                      { key: "expense", label: "支出" },
                      { key: "net", label: "収支" },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={yearlyOverviewMode === option.key ? "active" : ""}
                        disabled={option.key === "pie" && yearlyCategoryMode === "net"}
                        onClick={() => {
                          if (option.key === "pie" && yearlyCategoryMode === "net") return;
                          setYearlyOverviewMode(option.key);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={yearlyCategorySummary.items.map((item) => ({
                      category: item.name,
                      value: item.value,
                    }))}
                    layout="vertical"
                    margin={{ left: 16, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="category" width={96} />
                    <Tooltip formatter={(value) => formatYen(value)} />
                    <Bar dataKey="value">
                      {yearlyCategorySummary.items.map((item) => (
                        <Cell
                          key={item.name}
                          fill={getBarColorByMode(yearlyCategoryMode, item.value)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : yearlyOverviewSeries.length === 0 ? (
              <p className="muted">対象データがありません。</p>
            ) : (
              (() => {
                const yearlyBarMode: MonthlyCategoryMode =
                  yearlyOverviewMode === "income"
                    ? "income"
                    : yearlyOverviewMode === "expense"
                    ? "expense"
                    : "net";

                return (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>{yearlyCategoryYear}年の月毎{yearlyBarMode === "income" ? "収入" : yearlyBarMode === "expense" ? "支出" : "収支"}</h3>
                    <p className="muted">{categoryTrendMonths[0]} から {categoryTrendMonths[categoryTrendMonths.length - 1]} を月別に表示します。</p>
                  </div>
                  <div className="toggle-group">
                    {([
                      { key: "pie", label: "円グラフ" },
                      { key: "income", label: "収入" },
                      { key: "expense", label: "支出" },
                      { key: "net", label: "収支" },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={yearlyOverviewMode === option.key ? "active" : ""}
                        disabled={option.key === "pie" && yearlyCategoryMode === "net"}
                        onClick={() => {
                          if (option.key === "pie" && yearlyCategoryMode === "net") return;
                          setYearlyOverviewMode(option.key);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <CategoryMonthlyTrendChart
                  data={yearlyOverviewSeries.map((item) => ({
                    month: item.month,
                    value: item[yearlyBarMode],
                  }))}
                  category={
                    yearlyBarMode === "income"
                      ? "収入"
                      : yearlyBarMode === "expense"
                      ? "支出"
                      : "収支"
                  }
                  mode={yearlyBarMode}
                  focusMonthKey={yearlyChartAnchorMonthKey}
                  onVisibleMonthChange={handleVisibleYearSync}
                />
              </>
                );
              })()
            )}
          </div>
        </div>
        {selectedYearlyCategory && renderCategoryTransactions(yearlyCategoryTransactions, `${yearlyCategoryYear}年 ${selectedYearlyCategory} の取引明細`)}
      </TabPanel>
      )}

      {activeTab === "budget" && (
      <TabPanel title="5) 予算&損得">
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
                この月だけ保存
              </button>
            </div>
            <div className="budget-total-card">
              <div><strong>総額</strong><span>{formatYen(totalBudgetActual)} / {totalBudget > 0 ? formatYen(totalBudget) : "未設定"}</span></div>
              {totalBudgetRate != null && <>
                <progress max={100} value={Math.min(totalBudgetRate, 100)} className={totalBudgetRate > 100 ? "is-over" : ""} />
                <span className={totalBudgetRate > 100 ? "negative" : ""}>{totalBudgetRate.toFixed(1)}%・残り {formatYen(totalBudget - totalBudgetActual)}</span>
              </>}
            </div>
            <div className="inline-controls budget-range-controls">
              <label>一括適用の終了月<input type="month" min={budgetMonthKey} value={budgetApplyEndMonth} onChange={(event) => setBudgetApplyEndMonth(event.target.value)} /></label>
              <button type="button" onClick={handleApplyBudgetRange}>終了月まで上書き</button>
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
                      const budget = budgetDraft[category];
                      const isConfigured = budget != null && budget > 0;
                      const diff = isConfigured ? budget - actual : null;
                      const rate = isConfigured ? (actual / budget) * 100 : null;
                      return (
                        <tr key={category}>
                          <td>{category}</td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="未設定"
                              value={budget ?? ""}
                              onChange={(e) => setBudgetDraft((prev) => {
                                const next = { ...prev };
                                const value = Number(e.target.value);
                                if (!e.target.value || value <= 0) delete next[category];
                                else next[category] = Math.floor(value);
                                return next;
                              })}
                            />
                          </td>
                          <td>{formatYen(actual)}</td>
                          <td className={diff != null && diff < 0 ? "negative" : ""}>
                            {isConfigured ? <div className="budget-cell"><progress max={100} value={Math.min(rate ?? 0, 100)} className={(rate ?? 0) > 100 ? "is-over" : ""} /><span>{rate?.toFixed(1)}%・残り {formatYen(diff ?? 0)}</span></div> : "実績のみ"}
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
                      <Tooltip formatter={(value) => formatYen(value)} />
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
                    <Tooltip formatter={(value) => formatYen(value)} />
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

const SnapshotForm: React.FC<{
  assets: InvestmentAsset[];
  defaultDate: string;
  snapshots: Array<{ date: string; values: Record<string, number> }>;
  onSave: (date: string, values: Record<string, number>) => void;
}> = ({ assets, defaultDate, snapshots, onSave }) => {
  const [date, setDate] = React.useState(defaultDate);
  const [values, setValues] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const nearest = [...snapshots]
      .filter((snapshot) => snapshot.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    setValues(Object.fromEntries(assets.map((asset) => [
      asset.id,
      nearest?.values[asset.id] ?? asset.openingValue ?? 0,
    ])));
  }, [assets, date, snapshots]);

  return (
    <form
      className="snapshot-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date || assets.some((asset) => !Number.isInteger(values[asset.id] ?? 0))) {
          window.alert("日付と、円単位の整数評価額を入力してください。");
          return;
        }
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
            step="1"
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
