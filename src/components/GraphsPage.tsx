/* src/components/GraphsPage.tsx */

import React from "react";
import { visibleChartRange, investmentPeriodStartDate } from "../utils/chartDisplay";
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
  ReferenceLine,
} from "recharts";
import type { BarShapeProps, PieLabelRenderProps, TooltipContentProps } from "recharts";
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
import { PickerPanel, SelectionWheel } from "./PickerPanel";
import { useSegmentedDrag } from "../hooks/useSegmentedDrag";
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
const formatAxisAmount = (value: unknown) => Math.round(Number(value ?? 0)).toLocaleString();
const getMonthlyValueLabelFontSize = (label: string) => {
  const widthUnits = Array.from(label).reduce((sum, character) => {
    if (/\d/.test(character)) return sum + 0.59;
    if (character === ",") return sum + 0.32;
    if (character === "-" || character === "−") return sum + 0.4;
    return sum + 1.06;
  }, 0);
  return Math.round(Math.max(7, Math.min(12, 44 / Math.max(widthUnits, 1))) * 10) / 10;
};
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

const MonthlyValueBarShape: React.FC<Partial<BarShapeProps> & { showLabel: boolean }> = ({
  x,
  y,
  width,
  height,
  value,
  fill,
  stroke,
  strokeWidth,
  showLabel,
}) => {
  if (![x, y, width, height].every((item) => Number.isFinite(Number(item)))) return null;
  const resolved = Number(Array.isArray(value) ? value.at(-1) : value ?? 0);
  const rectX = Number(x);
  const rectY = Number(y);
  const rectWidth = Number(width);
  const rectHeight = Number(height);
  const normalizedY = rectHeight >= 0 ? rectY : rectY + rectHeight;
  const normalizedHeight = Math.abs(rectHeight);
  const labelY = resolved >= 0 ? normalizedY - 8 : normalizedY + normalizedHeight + 14;
  const label = formatYenNumber(resolved);
  const labelFontSize = getMonthlyValueLabelFontSize(label);

  return (
    <g>
      <rect
        x={rectX}
        y={normalizedY}
        width={rectWidth}
        height={normalizedHeight}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {showLabel && (
        <text x={rectX + rectWidth / 2} y={labelY} textAnchor="middle" fontSize={labelFontSize} fill="#4b5a52">
          {label}
        </text>
      )}
    </g>
  );
};

const renderCategoryPieLabel = (props: PieLabelRenderProps) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  const category = (props as PieLabelRenderProps & { category?: string }).category;
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
      fill="#245e2d"
      stroke="#f9fffb"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={15}
      fontWeight={600}
      pointerEvents="none"
    >
      {category}
    </text>
  );
};

const renderCategoryPieTooltip = ({ active, payload }: TooltipContentProps<number, string>) => {
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
  const step = getNiceStep(range / 5);
  const labelPadding = range * 0.12;

  const domainMin = Math.floor((rawMin < 0 ? rawMin - labelPadding : rawMin) / step) * step;
  let domainMax = Math.ceil((rawMax > 0 ? rawMax + labelPadding : rawMax) / step) * step;

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
const MONTHLY_TREND_SLOT_WIDTH = 52;
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

const TabPanel: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({
  title,
  className,
  children,
}) => (
  <div className={`graphs-section${className ? ` ${className}` : ""}`}>
    <div className="graphs-section-header">{title}</div>
    <div className="graphs-section-body">{children}</div>
  </div>
);

const shiftMonthKey = (monthKey: string, offset: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
};

const GraphMonthNavigation: React.FC<{
  value: string;
  onChange: (monthKey: string) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [year, month] = value.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  const years = React.useMemo(
    () => Array.from({ length: 41 }, (_, index) => currentYear - 30 + index),
    [currentYear]
  );
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const emit = (nextYear: number, nextMonth: number) => {
    onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}`);
  };

  return (
    <div className="graphs-month-nav">
      <button type="button" aria-label="前月" onClick={() => onChange(shiftMonthKey(value, -1))}>◁</button>
      <div className="graphs-month-picker">
        <button
          type="button"
          className="graphs-month-trigger"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >{year}年{month}月</button>
        {isOpen && (
          <PickerPanel
            title="年月を選択"
            onClose={() => setIsOpen(false)}
            action={<button type="button" onClick={() => onChange(getMonthKey(localDateISO()))}>今月</button>}
          >
            <div className="selection-wheel-columns">
              <SelectionWheel
                label="年"
                options={years.map((item) => `${item}年`)}
                selectedIndex={Math.max(0, years.indexOf(year))}
                onSelect={(index) => emit(years[index], month)}
              />
              <SelectionWheel
                label="月"
                options={months.map((item) => `${item}月`)}
                selectedIndex={Math.max(0, month - 1)}
                onSelect={(index) => emit(year, months[index])}
              />
            </div>
          </PickerPanel>
        )}
      </div>
      <button type="button" aria-label="翌月" onClick={() => onChange(shiftMonthKey(value, 1))}>▷</button>
    </div>
  );
};

const CategoryMonthlyTrendChart: React.FC<{
  data: Array<{ month: string; value: number }>;
  category: string;
  mode: MonthlyCategoryMode;
  colorOverride?: string;
  focusMonthKey: string;
  height?: number;
  onVisibleMonthChange?: (monthKey: string) => void;
  onMonthSelect?: (monthKey: string) => void;
}> = ({ data, category, mode, colorOverride, focusMonthKey, height = 320, onVisibleMonthChange, onMonthSelect }) => {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const autoAlignKeyRef = React.useRef("");
  const skipNextAutoAlignRef = React.useRef(false);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const dataAnimationKey = `${category}:${data.map((item) => `${item.month}:${item.value}`).join("|")}`;
  const [finishedDataAnimationKey, setFinishedDataAnimationKey] = React.useState("");

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

    return visibleChartRange(data.length, scrollLeft, viewportWidth, chartWidth);
  }, [data.length, scrollLeft, viewportWidth, chartWidth]);

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
  const [displayedDomain, setDisplayedDomain] = React.useState<[number, number]>(scale.domain);
  const displayedDomainRef = React.useRef(displayedDomain);

  React.useEffect(() => {
    displayedDomainRef.current = displayedDomain;
  }, [displayedDomain]);

  React.useEffect(() => {
    const from = displayedDomainRef.current;
    const to = scale.domain;
    if (from[0] === to[0] && from[1] === to[1]) return;

    const startedAt = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 420;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next: [number, number] = [
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased,
      ];
      displayedDomainRef.current = next;
      setDisplayedDomain(next);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [scale.domain]);

  const axisWidth = React.useMemo(() => {
    const longest = Math.max(
      formatAxisAmount(scale.domain[0]).length,
      formatAxisAmount(scale.domain[1]).length
    );
    return Math.max(44, longest * 5 + 6);
  }, [scale.domain]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !category || data.length === 0 || viewportWidth <= 0) return;

    const autoAlignKey = `${category}:${focusMonthKey}:${data.length}:${Math.round(viewportWidth)}`;
    if (autoAlignKeyRef.current === autoAlignKey) return;
    if (skipNextAutoAlignRef.current) {
      skipNextAutoAlignRef.current = false;
      autoAlignKeyRef.current = autoAlignKey;
      return;
    }

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
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 24, right: 0, bottom: 0, left: 0 }}
            accessibilityLayer={false}
            tabIndex={-1}
          >
            <XAxis hide />
            <YAxis
              width={axisWidth}
              domain={displayedDomain}
              ticks={scale.ticks}
              allowDataOverflow
              tick={{ fontSize: 8 }}
              tickFormatter={formatAxisAmount}
            />
            <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div ref={viewportRef} className="chart-scroll-viewport">
        <div className="chart-scroll-canvas" style={{ width: `${chartWidth}px` }}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={data}
              barCategoryGap={18}
              margin={{ top: 24, right: 6, bottom: 0, left: 6 }}
              accessibilityLayer={false}
              tabIndex={-1}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                interval={0}
                tick={{ fontSize: 9 }}
                tickMargin={6}
                tickFormatter={(month) => {
                  const [year, value] = String(month).split("-");
                  return `${year.slice(-2)}/${value}`;
                }}
              />
              <YAxis hide domain={displayedDomain} ticks={scale.ticks} allowDataOverflow />
              <ReferenceLine y={0} stroke="#7a8b80" strokeWidth={1.5} ifOverflow="extendDomain" />
              <Bar
                key={dataAnimationKey}
                dataKey="value"
                name={category}
                barSize={26}
                isAnimationActive={finishedDataAnimationKey !== dataAnimationKey}
                animationBegin={0}
                animationDuration={560}
                animationEasing="ease-out"
                onAnimationEnd={() => {
                  setFinishedDataAnimationKey(dataAnimationKey);
                }}
                onClick={(entry) => {
                  const month = String(entry?.payload?.month ?? "");
                  if (month && onMonthSelect) {
                    skipNextAutoAlignRef.current = true;
                    onMonthSelect(month);
                  }
                }}
                shape={<MonthlyValueBarShape showLabel={finishedDataAnimationKey === dataAnimationKey} />}
              >
                {data.map((entry) => (
                  <Cell
                    key={`${category}-${entry.month}`}
                    fill={colorOverride ?? getBarColorByMode(mode, entry.value)}
                    cursor={onMonthSelect ? "pointer" : undefined}
                  />
                ))}
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

  const [investmentState, setInvestmentState] = React.useState<InvestmentState>(() =>
    loadInvestmentState()
  );
  const [investmentChartMode, setInvestmentChartMode] = React.useState<"area" | "profit" | "pie">("area");
  const [investmentPeriodMonths, setInvestmentPeriodMonths] = React.useState<"3" | "6" | "12" | "all">("12");
  const [investmentMonthKey, setInvestmentMonthKey] = React.useState(currentMonthKey);

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
  const [finishedPortfolioPieAnimationKey, setFinishedPortfolioPieAnimationKey] = React.useState("");
  const [selectedPortfolioAccount, setSelectedPortfolioAccount] = React.useState("");
  const portfolioAccountRowsRef = React.useRef(new Map<string, HTMLTableRowElement>());
  const pieTapRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    select: () => void;
  } | null>(null);
  const beginPieTap = React.useCallback((event: React.PointerEvent<SVGElement>, select: () => void) => {
    pieTapRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      select,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);
  const completePieTap = React.useCallback((event: React.PointerEvent<SVGElement>) => {
    const pending = pieTapRef.current;
    pieTapRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) return;
    pending.select();
  }, []);
  const cancelPieTap = React.useCallback(() => {
    pieTapRef.current = null;
  }, []);

  const [categoryMonthKey, setCategoryMonthKey] = React.useState(currentMonthKey);
  const [monthlyCategoryMode, setMonthlyCategoryMode] =
    React.useState<MonthlyCategoryMode>("expense");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("");
  const [finishedCategoryPieAnimationKey, setFinishedCategoryPieAnimationKey] = React.useState("");

  const [yearlyCategoryYear, setYearlyCategoryYear] = React.useState(currentYear);
  const [yearlyCategoryMode, setYearlyCategoryMode] =
    React.useState<MonthlyCategoryMode>("net");
  const [selectedYearlyCategory, setSelectedYearlyCategory] = React.useState<string>("");
  const [yearlyOverviewMode, setYearlyOverviewMode] =
    React.useState<OverviewChartMode>("net");
  const [yearlyChartAnchorMonthKey, setYearlyChartAnchorMonthKey] = React.useState(currentMonthKey);

  const [budgetMonthKey, setBudgetMonthKey] = React.useState(currentMonthKey);
  const [budgets, setBudgets] = React.useState<BudgetEntry[]>(() => loadBudgets());
  const [budgetDraft, setBudgetDraft] = React.useState<Record<string, number>>({});
  const [savedBudgetDraft, setSavedBudgetDraft] = React.useState("");
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
  const historicalInvestmentAccounts = React.useMemo(
    () => accountMaster.filter((account) => account.kind === "investment"),
    [accountMaster],
  );
  const investmentAssets: InvestmentAsset[] = React.useMemo(() => investmentAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    initialPrincipal: account.openingBalance - (account.initialProfit ?? 0),
    openingValue: account.openingBalance,
  })), [investmentAccounts]);
  const historicalInvestmentAssets: InvestmentAsset[] = React.useMemo(() => historicalInvestmentAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    initialPrincipal: account.openingBalance - (account.initialProfit ?? 0),
    openingValue: account.openingBalance,
  })), [historicalInvestmentAccounts]);

  const handleSaveSnapshot = (date: string, values: Record<string, number>) => {
    const id = `is_${date}`;
    const nextSnapshots = investmentState.snapshots.some((s) => s.id === id)
      ? investmentState.snapshots.map((s) => (s.id === id ? { id, date, values: { ...s.values, ...values } } : s))
      : [...investmentState.snapshots, { id, date, values }];
    updateInvestmentState({
      ...investmentState,
      snapshots: nextSnapshots,
    });
  };

  const investmentSnapshots = React.useMemo(() => [...investmentState.snapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  ), [investmentState.snapshots]);
  const investmentAsOf = investmentMonthKey === currentMonthKey ? todayISO : monthEndISO(investmentMonthKey);
  const visibleInvestmentSnapshots = React.useMemo(
    () => investmentSnapshots.filter((snapshot) => snapshot.date <= investmentAsOf),
    [investmentAsOf, investmentSnapshots]
  );
  const latestSnapshot = visibleInvestmentSnapshots[visibleInvestmentSnapshots.length - 1];
  const snapshotDateForTable = investmentAsOf;
  const investmentValueAt = React.useCallback((account: Account, date: string) => {
    if (date < account.openingDate) return 0;
    const snapshot = [...investmentSnapshots]
      .filter((item) => item.date <= date && item.values[account.id] != null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return snapshot?.values[account.id] ?? account.openingBalance;
  }, [investmentSnapshots]);

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

  const investmentChartData = visibleInvestmentSnapshots.map((snapshot) => {
    const point: Record<string, number | string> = { date: snapshot.date };
    historicalInvestmentAssets.forEach((asset) => {
      const account = historicalInvestmentAccounts.find((item) => item.id === asset.id);
      point[asset.id] = account && isAccountVisibleOn(account, snapshot.date)
        ? investmentValueAt(account, snapshot.date)
        : 0;
    });
    return point;
  });

  const investmentProfitData = visibleInvestmentSnapshots.map((snapshot) => {
    const totalValue = historicalInvestmentAssets.reduce(
      (sum, asset) => {
        const account = historicalInvestmentAccounts.find((item) => item.id === asset.id);
        if (!account || !isAccountVisibleOn(account, snapshot.date)) return sum;
        return sum + investmentValueAt(account, snapshot.date);
      },
      0
    );
    const totals = historicalInvestmentAccounts.reduce((acc, account) => {
      if (!isAccountVisibleOn(account, snapshot.date)) return acc;
      const flow = investmentFlows(account, snapshot.date);
      acc.deposits += flow.cumulativeDeposits;
      acc.withdrawals += flow.withdrawals;
      return acc;
    }, { deposits: 0, withdrawals: 0 });
    const profit = totalValue + totals.withdrawals - totals.deposits;
    const profitRate = totals.deposits > 0 ? (profit / totals.deposits) * 100 : null;
    return { date: snapshot.date, profit, profitRate };
  });
  const investmentPeriodStart = investmentPeriodStartDate(investmentAsOf, investmentPeriodMonths);
  const filteredInvestmentChartData = investmentChartData.filter((point) => !investmentPeriodStart || String(point.date) >= investmentPeriodStart);
  const filteredInvestmentProfitData = investmentProfitData.filter((point) => !investmentPeriodStart || point.date >= investmentPeriodStart);
  const investmentPieData = investmentAssets.map((asset) => {
    const account = investmentAccounts.find((item) => item.id === asset.id)!;
    return { name: asset.name, value: investmentValueAt(account, investmentAsOf) };
  });
  const latestInvestmentTotal = investmentPieData.reduce((sum, asset) => sum + asset.value, 0);
  const investmentHasPositiveValue = investmentPieData.some((asset) => asset.value > 0);
  const investmentHasNegativeValue = investmentPieData.some((asset) => asset.value < 0);

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
    return Object.fromEntries(portfolioInvestmentAccounts.map((account) => [
      account.name,
      investmentValueAt(account, portfolioBalanceDate),
    ]));
  }, [portfolioInvestmentAccounts, portfolioBalanceDate, investmentValueAt]);
  const displayedEstimatedBalances = React.useMemo(
    () => ({ ...estimatedBalances, ...investmentValuesForPortfolio }),
    [estimatedBalances, investmentValuesForPortfolio]
  );
  const activeCardAccounts = React.useMemo(() => accountMaster.filter(
    (account) => account.kind === "credit_card" && account.creditCard && isAccountVisibleOn(account, portfolioBalanceDate)
  ), [accountMaster, portfolioBalanceDate]);
  const cardStatuses = React.useMemo(() => activeCardAccounts.map((account) => {
    const used = creditCardOutstandingAsOf(account, transactions, portfolioBalanceDate);
    const limit = accountActualState.cardLimitByMonth[portfolioMonthKey]?.[account.name] ?? account.creditCard?.limit ?? 0;
    return { account, limit, used, available: limit - used };
  }), [accountActualState.cardLimitByMonth, activeCardAccounts, portfolioBalanceDate, portfolioMonthKey, transactions]);
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
    setPortfolioActualInputs(fallback);
  }, [portfolioMonthKey, accountActualState, accountNames, estimatedBalances, investmentValuesForPortfolio]);

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
    const maxBalanceDate = portfolioMonthKey === currentMonthKey ? todayISO : portfolioAsOf;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(portfolioBalanceDate) ||
      getMonthKey(portfolioBalanceDate) !== portfolioMonthKey ||
      portfolioBalanceDate > maxBalanceDate
    ) {
      window.alert("残高基準日は対象月内かつ今日以前の日付を指定してください。");
      return;
    }
    const invalidAccount = accountNames.find((account) => !Number.isInteger(portfolioActualInputs[account]));
    if (invalidAccount) {
      window.alert(`${invalidAccount}の実残高は円単位の整数で入力してください。`);
      return;
    }
    const invalidCard = cardStatuses.find(({ account }) => !Number.isInteger(cardAvailableInputs[account.name]));
    if (invalidCard) {
      window.alert(`${invalidCard.account.name}の実利用可能額は円単位の整数で入力してください。`);
      return;
    }
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
      cardLimitByMonth: {
        ...accountActualState.cardLimitByMonth,
        [portfolioMonthKey]: Object.fromEntries(cardStatuses.map(({ account, limit }) => [account.name, limit])),
      },
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
      cardLimitByMonth: {
        ...accountActualState.cardLimitByMonth,
        [portfolioMonthKey]: Object.fromEntries(cardStatuses.map(({ account, limit }) => [account.name, limit])),
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

  const portfolioPieRawData = accountNames
    .map((account) => {
      const signedValue = portfolioDisplayValues[account] ?? 0;
      return { category: account, value: Math.abs(signedValue), signedValue };
    })
    .filter((item) => item.value > 0);
  const portfolioPieAbsoluteTotal = portfolioPieRawData.reduce((sum, item) => sum + item.value, 0);
  const portfolioPieData = portfolioPieRawData.map((item) => ({
    ...item,
    percent: portfolioPieAbsoluteTotal > 0 ? item.value / portfolioPieAbsoluteTotal : 0,
  }));
  const portfolioPieHasNegativeBalance = portfolioPieData.some((item) => item.signedValue < 0);
  const portfolioPieAnimationKey = `${portfolioMonthKey}:${portfolioPieData
    .map((item) => `${item.category}:${item.value}`)
    .join("|")}`;

  const portfolioChartRegularAccountNames = React.useMemo(() => {
    const masterNames = new Set(accountMaster.map((account) => account.name));
    const names = new Set(accountMaster
      .filter((account) => account.kind !== "credit_card" && account.kind !== "investment")
      .map((account) => account.name));
    transactions.forEach((transaction) => {
      if (transaction.source && !masterNames.has(transaction.source)) names.add(transaction.source);
      if (transaction.destination && !masterNames.has(transaction.destination)) names.add(transaction.destination);
    });
    return Array.from(names).sort();
  }, [accountMaster, transactions]);
  const portfolioChartInvestmentAccounts = React.useMemo(
    () => accountMaster.filter((account) => account.kind === "investment"),
    [accountMaster],
  );
  const portfolioChartAccountNames = React.useMemo(
    () => [...portfolioChartRegularAccountNames, ...portfolioChartInvestmentAccounts.map((account) => account.name)],
    [portfolioChartInvestmentAccounts, portfolioChartRegularAccountNames],
  );

  const portfolioMonths = Array.from(new Set([
    ...allMonthKeys,
    ...investmentSnapshots.map((snapshot) => getMonthKey(snapshot.date)),
    ...accountMaster.map((account) => getMonthKey(account.openingDate)),
    ...accountMaster.flatMap((account) => account.disabledAt ? [getMonthKey(account.disabledAt)] : []),
  ])).sort();
  const portfolioRange = listMonthKeysBetween(portfolioMonths[0], portfolioMonths[portfolioMonths.length - 1]);
  const portfolioAreaData = portfolioRange.map((month) => {
    const asOf = monthEndISO(month);
    const fallback = calcAccountBalancesAsOf(transactions, asOf, portfolioChartRegularAccountNames);
    const balances = Object.fromEntries(portfolioChartRegularAccountNames.map((name) => {
      const account = accountMaster.find((item) => item.name === name && item.kind !== "credit_card" && item.kind !== "investment");
      return [name, account
        ? isAccountVisibleOn(account, asOf) ? accountBalanceAsOf(account, transactions, asOf) : 0
        : fallback[name] ?? 0];
    }));
    portfolioChartInvestmentAccounts.forEach((account) => {
      balances[account.name] = isAccountVisibleOn(account, asOf) ? investmentValueAt(account, asOf) : 0;
    });
    const point: Record<string, number | string> = { month };
    portfolioChartAccountNames.forEach((account) => { point[account] = balances[account] ?? 0; });
    return point;
  });
  React.useEffect(() => {
    if (selectedPortfolioAccount && !accountNames.includes(selectedPortfolioAccount)) {
      setSelectedPortfolioAccount("");
    }
  }, [accountNames, selectedPortfolioAccount]);
  const handlePortfolioPieSelect = React.useCallback((account: string) => {
    setSelectedPortfolioAccount(account);
    window.requestAnimationFrame(() => {
      portfolioAccountRowsRef.current.get(account)?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
  }, []);
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

  const categoryPieData = React.useMemo(() => {
    const positiveItems = monthlyCategorySummary.items.filter((item) => item.value > 0);
    const total = positiveItems.reduce((sum, item) => sum + item.value, 0);
    return positiveItems.map((item) => ({
      category: item.name,
      value: item.value,
      percent: total > 0 ? item.value / total : 0,
    }));
  }, [monthlyCategorySummary.items]);
  const categoryPieAnimationKey = `${categoryMonthKey}:${monthlyCategoryMode}:${categoryPieData
    .map((item) => `${item.category}:${item.value}`)
    .join("|")}`;
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

  const renderCategoryTransactions = (items: Transaction[], title: string, embedded = false) => {
    const grouped = items.reduce<Array<{ date: string; items: Transaction[] }>>((groups, transaction) => {
      const latest = groups.at(-1);
      if (latest?.date === transaction.date) latest.items.push(transaction);
      else groups.push({ date: transaction.date, items: [transaction] });
      return groups;
    }, []);
    const formatTransactionDate = (date: string) => {
      const parsed = new Date(`${date}T00:00:00`);
      const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
      return `${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekdays[parsed.getDay()]}）`;
    };

    return (
      <section className={`category-transaction-card${embedded ? " embedded" : " card"}`}>
        <h3>{title}</h3>
        {items.length === 0 ? <p className="muted">該当する取引はありません。</p> : (
          <div className="category-transaction-list">
            {grouped.map((group) => (
              <div className="category-transaction-day" key={group.date}>
                <div className="category-transaction-date">{formatTransactionDate(group.date)}</div>
                {group.items.map((transaction) => (
                  <div className={`category-transaction-row type-${transaction.type}`} key={transaction.id}>
                    <div className="category-transaction-category">{transaction.category}</div>
                    <div className="category-transaction-description">
                      <strong>{transaction.name || "（摘要なし）"}</strong>
                      <span>{transaction.source}</span>
                    </div>
                    <div className={`category-transaction-amount ${transaction.type === "income" ? "positive" : "negative"}`}>
                      {transaction.type === "income" ? "+" : "−"}{formatYen(transactionDisplayAmount(transaction))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

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
    setSavedBudgetDraft(`${budgetMonthKey}:${JSON.stringify(budgetDraft)}`);
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
    const amount = Number(sontokuForm.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sontokuForm.date) || !Number.isInteger(amount) || amount <= 0) {
      window.alert("日付と、1円以上の整数金額を入力してください。");
      return;
    }
    const id = sontokuForm.id || `st_${crypto.randomUUID()}`;
    const entry: SontokuEntry = {
      id,
      date: sontokuForm.date,
      kind: sontokuForm.kind,
      amount,
      note: sontokuForm.note || "",
      updatedAtISO: new Date().toISOString(),
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
    { id: "category", label: "月次" },
    { id: "monthly", label: "推移" },
    { id: "portfolio", label: "資産" },
    { id: "invest", label: "投資" },
    { id: "budget", label: "予実" },
  ] as const;
  const [activeTab, setActiveTab] = React.useState<(typeof tabs)[number]["id"]>(
    () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      return tabs.some((tab) => tab.id === requested)
        ? requested as (typeof tabs)[number]["id"]
        : "category";
    }
  );
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const graphTabDrag = useSegmentedDrag<HTMLElement>({
    count: tabs.length,
    selectedIndex: activeTabIndex,
    onSelect: (index) => setActiveTab(tabs[index]?.id ?? "category"),
    cssVariable: "--graphs-tab-position",
    horizontalPadding: 3,
  });
  const activeMonthKey = activeTab === "category"
    ? categoryMonthKey
    : activeTab === "monthly"
      ? yearlyChartAnchorMonthKey
      : activeTab === "portfolio"
        ? portfolioMonthKey
        : activeTab === "invest"
          ? investmentMonthKey
          : budgetMonthKey;
  const handleGraphMonthChange = React.useCallback((monthKey: string) => {
    if (activeTab === "category") {
      setCategoryMonthKey(monthKey);
      return;
    }
    if (activeTab === "monthly") {
      setYearlyCategoryYear(monthKey.slice(0, 4));
      setYearlyChartAnchorMonthKey(monthKey);
      return;
    }
    if (activeTab === "portfolio") {
      setPortfolioMonthKey(monthKey);
      return;
    }
    if (activeTab === "invest") {
      setInvestmentMonthKey(monthKey);
      return;
    }
    setBudgetMonthKey(monthKey);
    setSontokuMonthKey(monthKey);
  }, [activeTab]);

  return (
    <div className="graphs-page-root">
      <div className="graphs-page-chrome">
        <div className="graphs-page-header">
          <GraphMonthNavigation value={activeMonthKey} onChange={handleGraphMonthChange} />
          <details className="graphs-view-options">
            <summary aria-label="グラフ表示設定">•••</summary>
            <div>
              <button
                type="button"
                className={showFutureTransactions ? "active" : ""}
                aria-pressed={showFutureTransactions}
                onClick={() => onShowFutureTransactionsChange(!showFutureTransactions)}
              >未来の記録 {showFutureTransactions ? "ON" : "OFF"}</button>
              <button
                type="button"
                className={includeExcludedAnalytics ? "active" : ""}
                aria-pressed={includeExcludedAnalytics}
                onClick={() => onIncludeExcludedAnalyticsChange(!includeExcludedAnalytics)}
              >通算・特別 {includeExcludedAnalytics ? "含む" : "除外"}</button>
            </div>
          </details>
        </div>
        <nav
          ref={graphTabDrag.ref}
          className={`graphs-tabs ${graphTabDrag.isDragging ? "is-dragging" : ""}`}
          aria-label="グラフモード"
          style={{ "--graphs-tab-index": activeTabIndex } as React.CSSProperties}
          {...graphTabDrag.handlers}
        >
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
        </nav>
      </div>
      <div ref={contentRef} className="graphs-page-content">

      {activeTab === "invest" && (
      <TabPanel title="4) 投資損益" className="graph-mode-invest">
        <div className="section-grid">
          <div className="card">
            <h3>資産一覧</h3>
            <p className="muted">{investmentAsOf}時点の入出金・評価額（評価更新：{latestSnapshot?.date ?? "開始残高"}）</p>
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
                      const current = investmentValueAt(account, snapshotDateForTable);
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
              key={investmentAsOf}
              assets={investmentAssets}
              defaultDate={investmentAsOf}
              snapshots={investmentSnapshots}
              onSave={handleSaveSnapshot}
            />
          </div>
        </div>

        <div className="card chart-card">
          <div className="investment-chart-heading">
            <h3>{investmentChartMode === "area" ? "評価額推移" : investmentChartMode === "profit" ? "損益額 / 損益率" : "現在構成"}</h3>
            <div
              className="app-segmented-control investment-chart-mode-control"
              style={{ "--segment-count": 3, "--segment-index": ["area", "profit", "pie"].indexOf(investmentChartMode) } as React.CSSProperties}
            >
              <button type="button" className={investmentChartMode === "area" ? "active" : ""} onClick={() => setInvestmentChartMode("area")}>積上</button>
              <button type="button" className={investmentChartMode === "profit" ? "active" : ""} onClick={() => setInvestmentChartMode("profit")}>損益</button>
              <button type="button" className={investmentChartMode === "pie" ? "active" : ""} onClick={() => setInvestmentChartMode("pie")}>円</button>
            </div>
          </div>
          {investmentChartMode !== "pie" && (
            <div
              className="app-segmented-control investment-period-control"
              style={{ "--segment-count": 4, "--segment-index": ["3", "6", "12", "all"].indexOf(investmentPeriodMonths) } as React.CSSProperties}
            >
              {([['3','3か月'],['6','6か月'],['12','1年'],['all','全期間']] as const).map(([value, label]) => <button key={value} type="button" className={investmentPeriodMonths === value ? "active" : ""} onClick={() => setInvestmentPeriodMonths(value)}>{label}</button>)}
            </div>
          )}
          {investmentChartMode === "area" ? (
            filteredInvestmentChartData.length === 0 ? (
              <p className="muted">選択期間に評価額の記録がありません。期間を広げるか、現在額更新から登録してください。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={filteredInvestmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatYen(value)} />
                  <Legend />
                  {historicalInvestmentAssets.map((asset, idx) => (
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
              <p className="muted">選択期間に評価額の記録がありません。期間を広げるか、現在額更新から登録してください。</p>
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
          ) : investmentHasNegativeValue ? <p className="muted">マイナス評価額を含むため、構成比を表示できません。資産一覧で評価額を確認してください。</p> : !investmentHasPositiveValue ? <p className="muted">この時点の評価額はすべて0円です。現在額更新から評価額を登録できます。</p> : (
            <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={investmentPieData} dataKey="value" nameKey="name" outerRadius={95}>{investmentPieData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => formatYen(value)} /><Legend /></PieChart></ResponsiveContainer>
          )}
        </div>
      </TabPanel>
      )}

      {activeTab === "portfolio" && (
      <TabPanel title="3) ポートフォリオ（口座別）" className="graph-mode-portfolio">
        <div className="section-grid">
          <div className="card">
            <div className="inline-controls">
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
                        <tr
                          key={account}
                          ref={(node) => {
                            if (node) portfolioAccountRowsRef.current.set(account, node);
                            else portfolioAccountRowsRef.current.delete(account);
                          }}
                          className={selectedPortfolioAccount === account ? "selected-account-row" : undefined}
                        >
                          <td>{account}</td>
                          <td>{formatYen(estimated)}</td>
                          <td>
                            <input
                              type="number"
                              inputMode="numeric"
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
                    <tbody>{cardStatuses.map(({ account, limit, used, available }) => (
                      <tr key={account.id}>
                        <td>{account.name}<span className="muted"> / 上限 {formatYen(limit)}</span></td><td>{formatYen(used)}</td><td>{formatYen(available)}</td>
                        <td><input type="number" inputMode="numeric" value={cardAvailableInputs[account.name] ?? available} onChange={(event) => setCardAvailableInputs((current) => ({ ...current, [account.name]: Number(event.target.value) }))} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <button type="button" onClick={handleConfirmCards}>{cardMonthConfirmed ? "確認済み" : "カード残高を確認済みにする"}</button>
              </>
            )}
          </div>
          <div className="card chart-card">
            <div className="chart-header-actions">
              <h3>{portfolioChartMode === "pie" ? "口座別構成" : "口座別残高推移"}</h3>
              <div className="toggle-group">
                <button type="button" className={portfolioChartMode === "pie" ? "active" : ""} onClick={() => setPortfolioChartMode("pie")}>円</button>
                <button type="button" className={portfolioChartMode === "stacked" ? "active" : ""} onClick={() => setPortfolioChartMode("stacked")}>積上</button>
              </div>
            </div>
            {portfolioChartMode === "pie" && portfolioPieHasNegativeBalance && <p className="muted portfolio-pie-note">マイナス残高を含むため、円グラフは各残高の絶対額で構成比を表示しています。</p>}
            {portfolioChartMode === "pie" ? (portfolioPieData.length === 0 ? (
              <p className="muted">データがありません。</p>
            ) : (
              <div className="pie-chart-wrap">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      key={portfolioPieAnimationKey}
                      data={portfolioPieData}
                      dataKey="value"
                      nameKey="category"
                      outerRadius={78}
                      startAngle={90}
                      endAngle={-270}
                      labelLine={false}
                      label={finishedPortfolioPieAnimationKey === portfolioPieAnimationKey ? renderCategoryPieLabel : false}
                      animationBegin={0}
                      animationDuration={1050}
                      animationEasing="ease-out"
                      isAnimationActive={finishedPortfolioPieAnimationKey !== portfolioPieAnimationKey}
                      onAnimationEnd={() => setFinishedPortfolioPieAnimationKey(portfolioPieAnimationKey)}
                    >
                      {portfolioPieData.map((item, idx) => (
                          <Cell
                            key={item.category}
                            fill={chartColors[idx % chartColors.length]}
                            cursor="pointer"
                            onPointerDown={(event) => beginPieTap(event, () => handlePortfolioPieSelect(item.category))}
                            onPointerUp={completePieTap}
                            onPointerCancel={cancelPieTap}
                          />
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
            )) : portfolioChartAccountNames.length === 0 ? (
              <p className="muted">データがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={portfolioAreaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatYen(value)} />
                  <Legend />
                  {portfolioChartAccountNames.map((account, idx) => (
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
      <TabPanel title="1) 月毎収支（カテゴリ内訳 + 推移）" className="graph-mode-category">
        <div className="graph-context-bar" aria-label="月次表示">
          <div
            className="toggle-group graph-mode-toggle"
            style={{ "--graph-mode-index": ["expense", "income", "net"].indexOf(monthlyCategoryMode) } as React.CSSProperties}
          >
            {(["expense", "income", "net"] as const).map((mode) => (
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
        </div>
        <div className="monthly-category-layout">
          <div className="card monthly-category-sidebar">
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
            {selectedCategory && renderCategoryTransactions(
              monthlyCategoryTransactions,
              `${categoryMonthKey} ${selectedCategory} の取引明細`,
              true,
            )}
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
                    height={190}
                    onMonthSelect={setCategoryMonthKey}
                  />
                )}
              </>
            ) : canRenderCategoryPie ? (
              <>
                <div className="monthly-category-chart-header">
                  <div>
                    <h3>カテゴリ内訳</h3>
                  </div>
                </div>
                <div className="pie-chart-wrap">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie
                        key={categoryPieAnimationKey}
                        data={categoryPieData}
                        dataKey="value"
                        nameKey="category"
                        outerRadius={78}
                        startAngle={90}
                        endAngle={-270}
                        labelLine={false}
                        label={finishedCategoryPieAnimationKey === categoryPieAnimationKey ? renderCategoryPieLabel : false}
                        animationBegin={0}
                        animationDuration={1050}
                        animationEasing="ease-out"
                        isAnimationActive={finishedCategoryPieAnimationKey !== categoryPieAnimationKey}
                        onAnimationEnd={() => setFinishedCategoryPieAnimationKey(categoryPieAnimationKey)}
                      >
                        {categoryPieData.map((item, idx) => (
                          <Cell
                            key={item.category}
                            fill={chartColors[idx % chartColors.length]}
                            cursor="pointer"
                            onPointerDown={(event) => beginPieTap(event, () => setSelectedCategory(item.category))}
                            onPointerUp={completePieTap}
                            onPointerCancel={cancelPieTap}
                          />
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
                  height={190}
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
                <ResponsiveContainer width="100%" height={190}>
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
                    <Bar dataKey="value" isAnimationActive={false}>
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
      </TabPanel>
      )}

      {activeTab === "monthly" && (
      <TabPanel title="2) 収支推移（年合計 + 月推移）" className="graph-mode-monthly">
        <div className="graph-context-bar" aria-label="推移表示">
          <div
            className="toggle-group graph-mode-toggle"
            style={{ "--graph-mode-index": ["expense", "income", "net"].indexOf(yearlyCategoryMode) } as React.CSSProperties}
          >
            {(["expense", "income", "net"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={yearlyCategoryMode === mode ? "active" : ""}
                onClick={() => {
                  setYearlyCategoryMode(mode);
                  setYearlyOverviewMode(mode);
                  setSelectedYearlyCategory("");
                }}
              >
                {mode === "income" ? "収入" : mode === "expense" ? "支出" : "収支"}
              </button>
            ))}
          </div>
        </div>
        <div className="monthly-category-layout">
          <div className="card monthly-category-sidebar">
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
      <TabPanel title="5) 予算&損得" className="graph-mode-budget">
        <div className="section-grid">
          <div className="card">
            <h3>予算（カテゴリ別）</h3>
            <div className="inline-controls">
              <button type="button" onClick={handleSaveBudget}>
                この月だけ保存
              </button>
              {savedBudgetDraft === `${budgetMonthKey}:${JSON.stringify(budgetDraft)}` && <span role="status">保存しました</span>}
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
                              inputMode="numeric"
                              min="1"
                              step="1"
                              placeholder="未設定"
                              aria-label={`${category}の予算`}
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
              {sontokuMode === "total" && (
                <PeriodFilter value={sontokuPeriod} onChange={setSontokuPeriod} />
              )}
            </div>

            <div className="sontoku-cards">
              <div>
                <span>我慢合計</span>
                <strong>{formatYen(sontokuSummary.gain)}</strong>
              </div>
              <div>
                <span>衝動買い合計</span>
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
                      <Bar dataKey="gain" name="我慢" fill="#59A14F" />
                      <Bar dataKey="loss" name="衝動買い" fill="#E15759" />
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
                    {kind === "gain" ? "我慢（得）" : "衝動買い（損）"}
                  </button>
                ))}
              </div>
              <label>
                金額
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
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
                          {entry.kind === "gain" ? "我慢" : "衝動買い"}
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
  const [savedValues, setSavedValues] = React.useState("");

  React.useEffect(() => {
    setValues(Object.fromEntries(assets.map((asset) => [
      asset.id,
      [...snapshots]
        .filter((snapshot) => snapshot.date <= date && snapshot.values[asset.id] != null)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.values[asset.id] ?? asset.openingValue ?? 0,
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
        setSavedValues(`${date}:${JSON.stringify(values)}`);
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
            inputMode="numeric"
            step="1"
            value={values[asset.id] ?? 0}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [asset.id]: Number(e.target.value) || 0 }))
            }
          />
        </label>
      ))}
      <button type="submit" disabled={assets.length === 0}>更新</button>
      {savedValues === `${date}:${JSON.stringify(values)}` && <span role="status">評価額を保存しました</span>}
    </form>
  );
};
