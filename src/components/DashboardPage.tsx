/* src/components/DashboardPage.tsx */

import React, { useState } from "react";
import  type { Transaction } from "../types/Transaction";
import type { Account } from "../types/Account";
import type { Category } from "../types/Category";
import { CalendarView } from "./CalendarView";
import { SummaryView} from "./SummaryView";
import { InputForm } from "./InputForm";
import { TransactionHistory } from "./TransactionHistory";
import { HistorySearch } from "./HistorySearch";
import { MonthEndReminder } from "./MonthEndReminder";
import { isIncludedInRegularAnalytics } from "../utils/analytics";
import { localDateISO } from "../utils/date";
import { historyEntryFlowTop } from "../utils/historyScroll";
import './DashboardPage.css';

interface Props {
	transactions: Transaction[];
	showFutureTransactions: boolean;
	onShowFutureTransactionsChange: (show: boolean) => void;
	includeExcludedAnalytics: boolean;
	onIncludeExcludedAnalyticsChange: (include: boolean) => void;
	accounts: Account[];
	categories: Category[];
	onDeleteTransaction: (id: string) => void;
	onDeleteReceipt: (groupId: string) => boolean;
	onEditTransaction: (transaction: Transaction) => void;
	onAddTransaction: (transaction: Omit<Transaction, "id">) => void;
	onUpdateTransaction: (transaction: Transaction) => void;
	editingTransaction: Transaction | null;
	setEditingTransaction: (transaction: Transaction | null) => void;
}

export const DashboardPage: React.FC<Props> = (props) => {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [activeGroupDate, setActiveGroupDate] = useState<string | null>(null);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [isInputSheetOpen, setIsInputSheetOpen] = useState(false);
	const [isInputSheetExpanded, setIsInputSheetExpanded] = useState(false);
	const [isEditingDirty, setIsEditingDirty] = useState(false);
	const [lastCalendarTapDate, setLastCalendarTapDate] = useState<string | null>(null);
	const [visualViewport, setVisualViewport] = useState(() => ({
		height: typeof window === "undefined" ? 852 : window.visualViewport?.height ?? window.innerHeight,
		offsetTop: typeof window === "undefined" ? 0 : window.visualViewport?.offsetTop ?? 0,
		keyboardVisible: false,
	}));
	const inputSectionRef = React.useRef<HTMLElement | null>(null);
	const sheetDrag = React.useRef<{
		pointerId: number;
		startY: number;
		startHeight: number;
		minHeight: number;
		maxHeight: number;
		lastY: number;
		lastAt: number;
		velocityY: number;
		startedExpanded: boolean;
	} | null>(null);
	const sheetSwipe = React.useRef<{
		identifier: number;
		startX: number;
		startY: number;
		startedAt: number;
	} | null>(null);
	const sheetWasDragged = React.useRef(false);
	const historySectionRef = React.useRef<HTMLElement | null>(null);

	React.useEffect(() => {
		if (!isInputSheetOpen) return;
		const viewport = window.visualViewport;
		const updateViewport = () => {
			const height = viewport?.height ?? window.innerHeight;
			setVisualViewport({
				height,
				offsetTop: viewport?.offsetTop ?? 0,
				keyboardVisible: height < window.innerHeight - 120,
			});
		};
		updateViewport();
		viewport?.addEventListener("resize", updateViewport);
		viewport?.addEventListener("scroll", updateViewport);
		window.addEventListener("orientationchange", updateViewport);
		return () => {
			viewport?.removeEventListener("resize", updateViewport);
			viewport?.removeEventListener("scroll", updateViewport);
			window.removeEventListener("orientationchange", updateViewport);
		};
	}, [isInputSheetOpen]);

	React.useEffect(() => {
		if (!isInputSheetOpen || window.matchMedia("(min-width: 768px)").matches) return;
		const scrollY = window.scrollY;
		const previous = {
			position: document.body.style.position,
			top: document.body.style.top,
			left: document.body.style.left,
			right: document.body.style.right,
			width: document.body.style.width,
			overflow: document.body.style.overflow,
		};
		document.documentElement.dataset.inputSheetOpen = "true";
		document.body.style.position = "fixed";
		document.body.style.top = `-${scrollY}px`;
		document.body.style.left = "0";
		document.body.style.right = "0";
		document.body.style.width = "100%";
		document.body.style.overflow = "hidden";
		return () => {
			delete document.documentElement.dataset.inputSheetOpen;
			Object.assign(document.body.style, previous);
			window.scrollTo(0, scrollY);
		};
	}, [isInputSheetOpen]);

	React.useEffect(() => {
		if (!lastCalendarTapDate) return;
		const resetUnlessSameDate = (event: PointerEvent) => {
			const dateCell = event.target instanceof Element
				? event.target.closest<HTMLElement>("[data-calendar-date]")
				: null;
			if (dateCell?.dataset.calendarDate === lastCalendarTapDate) return;
			setLastCalendarTapDate(null);
		};
		const reset = () => setLastCalendarTapDate(null);
		document.addEventListener("pointerdown", resetUnlessSameDate, true);
		document.addEventListener("wheel", reset, true);
		document.addEventListener("keydown", reset, true);
		return () => {
			document.removeEventListener("pointerdown", resetUnlessSameDate, true);
			document.removeEventListener("wheel", reset, true);
			document.removeEventListener("keydown", reset, true);
		};
	}, [lastCalendarTapDate]);

	React.useEffect(() => {
		const returnToCurrentMonth = () => {
			const now = new Date();
			if (currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth()) return;
			setLastCalendarTapDate(null);
			setSelectedDate(localDateISO(now));
			setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
		};
		window.addEventListener("household:reselect-calendar", returnToCurrentMonth);
		return () => window.removeEventListener("household:reselect-calendar", returnToCurrentMonth);
	}, [currentDate]);

	const year = currentDate.getFullYear();
	const month = currentDate.getMonth();

	//１．今月のデータ抽出
	const monthlyData = React.useMemo(() => props.transactions.filter((transaction) => {
		const transactionDate = new Date(transaction.date);
		return transactionDate.getFullYear() === year && transactionDate.getMonth() === month;
	}), [props.transactions, year, month]);

	//2. 繰越金計算
	const openingBalance = props.transactions
		.filter((transaction) => new Date(transaction.date) < new Date(year, month, 1) && isIncludedInRegularAnalytics(transaction, props.includeExcludedAnalytics))
		.reduce((sum, transaction) => {
			if (transaction.type === "income") return sum + transaction.amount;
			if (transaction.type === "expense") return sum - transaction.amount;
			return sum;
		}, 0);

		const [selectedDate, setSelectedDate] = React.useState(
			localDateISO()
		);

	const confirmDiscardEdit = () => !isEditingDirty || window.confirm("保存していない編集内容を破棄しますか？");
	const closeInputSheet = () => {
		if (!confirmDiscardEdit()) return false;
		setIsInputSheetOpen(false);
		props.setEditingTransaction(null);
		setIsEditingDirty(false);
		return true;
	};

	const openEditSheet = (transaction: Transaction) => {
		if (!confirmDiscardEdit()) return false;
		setActiveGroupId(null);
		setActiveGroupDate(null);
		props.onEditTransaction(transaction);
		setIsInputSheetOpen(true);
		setIsInputSheetExpanded(false);
		return true;
	};

	const handleDateClick = (date: string) => {
		if (date === lastCalendarTapDate) {
			if (!confirmDiscardEdit()) return;
			props.setEditingTransaction(null);
			setActiveGroupId(null);
			setActiveGroupDate(null);
			setIsInputSheetOpen(true);
			setIsInputSheetExpanded(false);
			setLastCalendarTapDate(null);
			return;
		}
		setSelectedDate(date);
		setLastCalendarTapDate(date);
		if (!monthlyData.some((transaction) => transaction.date === date)) return;
		window.requestAnimationFrame(() => {
			const scroller = historySectionRef.current;
			const target = document.getElementById(`history-date-${date}`);
			if (!scroller || !target) return;
			scroller.scrollTo({ top: historyEntryFlowTop(target), behavior: "smooth" });
		});
	};
	const resetCalendarTap = () => setLastCalendarTapDate(null);
	const sheetSnapHeights = () => {
		const viewportHeight = window.innerHeight;
		const maxHeight = Math.max(0, viewportHeight - 83);
		return {
			minHeight: Math.min(viewportHeight * 0.70775, maxHeight),
			maxHeight,
		};
	};
	const handleSheetPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (!event.isPrimary || visualViewport.keyboardVisible) return;
		const section = inputSectionRef.current;
		if (!section) return;
		const { minHeight, maxHeight } = sheetSnapHeights();
		const startHeight = section.getBoundingClientRect().height;
		sheetDrag.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			startHeight,
			minHeight,
			maxHeight,
			lastY: event.clientY,
			lastAt: event.timeStamp,
			velocityY: 0,
			startedExpanded: isInputSheetExpanded,
		};
		sheetWasDragged.current = false;
		section.style.setProperty("--sheet-drag-height", `${startHeight}px`);
		section.classList.add("sheet-dragging");
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const handleSheetPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const drag = sheetDrag.current;
		const section = inputSectionRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !section) return;
		const delta = event.clientY - drag.startY;
		if (Math.abs(delta) >= 4) sheetWasDragged.current = true;
		const dismissibleMinimum = drag.startedExpanded ? drag.minHeight : Math.max(0, drag.minHeight - 110);
		const nextHeight = Math.max(dismissibleMinimum, Math.min(drag.maxHeight, drag.startHeight - delta));
		const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
		drag.velocityY = (event.clientY - drag.lastY) / elapsed;
		drag.lastY = event.clientY;
		drag.lastAt = event.timeStamp;
		section.style.setProperty("--sheet-drag-height", `${nextHeight}px`);
	};
	const handleSheetPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
		const drag = sheetDrag.current;
		const section = inputSectionRef.current;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		if (drag && section && drag.pointerId === event.pointerId && sheetWasDragged.current) {
			const currentHeight = section.getBoundingClientRect().height;
			const midpoint = (drag.minHeight + drag.maxHeight) / 2;
			const shouldDismiss = !drag.startedExpanded && (
				drag.velocityY >= 0.35 || currentHeight <= drag.minHeight - 48
			);
			if (shouldDismiss) {
				closeInputSheet();
			} else {
				const nextExpanded = Math.abs(drag.velocityY) >= 0.35
					? drag.velocityY < 0
					: currentHeight >= midpoint;
				setIsInputSheetExpanded(nextExpanded);
			}
			window.requestAnimationFrame(() => {
				section.classList.remove("sheet-dragging");
				section.style.removeProperty("--sheet-drag-height");
			});
		} else if (section) {
			section.classList.remove("sheet-dragging");
			section.style.removeProperty("--sheet-drag-height");
		}
		sheetDrag.current = null;
		window.setTimeout(() => { sheetWasDragged.current = false; }, 0);
	};
	const handleSheetTouchStart = (event: React.TouchEvent<HTMLElement>) => {
		if (visualViewport.keyboardVisible || event.touches.length !== 1) {
			sheetSwipe.current = null;
			return;
		}
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest(".input-sheet-handle")) return;
		const touch = event.touches[0];
		sheetSwipe.current = {
			identifier: touch.identifier,
			startX: touch.clientX,
			startY: touch.clientY,
			startedAt: event.timeStamp,
		};
	};
	const handleSheetTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
		const swipe = sheetSwipe.current;
		sheetSwipe.current = null;
		if (!swipe) return;
		const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === swipe.identifier);
		if (!touch) return;
		const deltaX = touch.clientX - swipe.startX;
		const deltaY = touch.clientY - swipe.startY;
		const elapsed = event.timeStamp - swipe.startedAt;
		if (elapsed > 550 || Math.abs(deltaY) < 48 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.25) return;
		event.preventDefault();
		sheetWasDragged.current = true;
		if (deltaY < 0) {
			if (!isInputSheetExpanded) setIsInputSheetExpanded(true);
		} else if (isInputSheetExpanded) {
			setIsInputSheetExpanded(false);
		} else {
			closeInputSheet();
		}
		window.setTimeout(() => { sheetWasDragged.current = false; }, 250);
	};


	return (
		<div className="dashboard-page-root">
			<MonthEndReminder accounts={props.accounts} transactions={props.transactions} />
			<section className="column calendar-section">
				<div className="scroll-content">
					<CalendarView
						year={year}
						month={month}
						monthlyData={monthlyData}
						onMonthChange={(offset: number) => {
							setLastCalendarTapDate(null);
							setCurrentDate(new Date(year, month + offset, 1));
						}}
						onMonthSelect={(nextYear, nextMonth) => {
							setLastCalendarTapDate(null);
							setCurrentDate(new Date(nextYear, nextMonth, 1));
						}}
						onDateClick={handleDateClick}
						onOpenSearch={() => {
							resetCalendarTap();
							setIsSearchOpen(true);
						}}
						onToggleFuture={() => {
							resetCalendarTap();
							props.onShowFutureTransactionsChange(!props.showFutureTransactions);
						}}
						showFutureTransactions={props.showFutureTransactions}
						onToggleExcluded={() => {
							resetCalendarTap();
							props.onIncludeExcludedAnalyticsChange(!props.includeExcludedAnalytics);
						}}
						includeExcludedAnalytics={props.includeExcludedAnalytics}
						/>
						<SummaryView
							monthlyData={monthlyData}
							openingBalance={openingBalance}
							includeExcludedAnalytics={props.includeExcludedAnalytics}
					/>
				</div>
			</section>
			<section
				ref={historySectionRef}
				className="column history-section"
			>
				<TransactionHistory
					key={`${year}-${month}`}
					monthlyData={monthlyData}
					onDeleteTransaction={props.onDeleteTransaction}
					onEditTransaction={openEditSheet}
					onSelectGroup={(groupId, date) => {
						setActiveGroupId(groupId);
						setActiveGroupDate(date);
						props.setEditingTransaction(null);
						setIsInputSheetOpen(true);
						setIsInputSheetExpanded(false);
					}}
				/>
		</section>
		{isInputSheetOpen && <button className="input-sheet-backdrop" aria-label="入力画面を閉じる" onClick={closeInputSheet} />}
		<section
			ref={inputSectionRef}
			className={`column input-section ${isInputSheetOpen ? "sheet-open" : ""} ${isInputSheetExpanded ? "sheet-expanded" : ""} ${visualViewport.keyboardVisible ? "keyboard-visible" : ""}`}
			style={isInputSheetOpen ? {
				"--visual-viewport-height": `${visualViewport.height}px`,
				"--visual-viewport-offset": `${visualViewport.offsetTop}px`,
			} as React.CSSProperties : undefined}
			onFocusCapture={(event) => {
				const target = event.target;
				if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
					setIsInputSheetExpanded(true);
				}
			}}
			onTouchStartCapture={handleSheetTouchStart}
			onTouchEndCapture={handleSheetTouchEnd}
		>
			<div className="input-sheet-toolbar">
				<button
					type="button"
					className="input-sheet-handle"
					aria-label={isInputSheetExpanded ? "入力画面を縮める" : "入力画面を広げる"}
					onPointerDown={handleSheetPointerDown}
					onPointerMove={handleSheetPointerMove}
					onPointerUp={handleSheetPointerUp}
					onPointerCancel={handleSheetPointerUp}
					onClick={() => { if (!sheetWasDragged.current) setIsInputSheetExpanded((current) => !current); }}
				><span /></button>
				<button type="button" className="input-sheet-close" aria-label="入力画面を閉じる" onClick={closeInputSheet}>×</button>
			</div>
			<div className="sticky-input">
					<InputForm
						onAddTransaction={props.onAddTransaction}
						onUpdateTransaction={props.onUpdateTransaction}
						onDeleteTransaction={props.onDeleteTransaction}
						onDeleteReceipt={props.onDeleteReceipt}
					editingTransaction={props.editingTransaction}
					setEditingTransaction={props.setEditingTransaction}
					selectedDate={selectedDate}
					monthlyData={monthlyData}
					accounts={props.accounts}
					categories={props.categories}
					draftScope={`calendar:${selectedDate}`}
					onEditingDirtyChange={setIsEditingDirty}
					activeGroupId={activeGroupId}
					setActiveGroupId={setActiveGroupId}
					activeGroupDate={activeGroupDate}
					setActiveGroupDate={setActiveGroupDate}
				/>
			</div>
		</section>
		{isSearchOpen && (
			<HistorySearch
				transactions={props.transactions}
				onClose={() => setIsSearchOpen(false)}
				onDeleteTransaction={props.onDeleteTransaction}
				onEditTransaction={(transaction) => {
					if (openEditSheet(transaction)) setIsSearchOpen(false);
				}}
				onSelectGroup={(groupId, date) => {
					if (!confirmDiscardEdit()) return;
					setIsSearchOpen(false);
					setActiveGroupId(groupId);
					setActiveGroupDate(date);
					props.setEditingTransaction(null);
					setIsInputSheetOpen(true);
					setIsInputSheetExpanded(false);
				}}
			/>
		)}
	</div>
	);
}
