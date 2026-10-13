// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionHistory } from "../src/components/TransactionHistory";
import type { Transaction } from "../src/types/Transaction";

const transaction: Transaction = {
  id: "swipe-test",
  type: "expense",
  amount: 123,
  date: "2026-10-13",
  name: "表示確認用",
  category: "食料品費",
  source: "財布",
  destination: "",
  memo: "",
  isSpecial: false,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("history swipe deletion", () => {
  it("deletes after a full left swipe", () => {
    vi.useFakeTimers();
    const onDeleteTransaction = vi.fn();
    render(
      <TransactionHistory
        monthlyData={[transaction]}
        onDeleteTransaction={onDeleteTransaction}
        onEditTransaction={vi.fn()}
        onSelectGroup={vi.fn()}
      />,
    );
    const row = screen.getByText("表示確認用").closest<HTMLElement>(".swipe-front")!;
    const swipeRow = row.closest<HTMLElement>(".swipe-row")!;
    vi.spyOn(swipeRow, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
    row.setPointerCapture = vi.fn();
    row.hasPointerCapture = vi.fn(() => true);
    row.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 380, clientY: 100 });
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 40, clientY: 100 });
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 40, clientY: 100 });
    act(() => vi.advanceTimersByTime(320));

    expect(onDeleteTransaction).toHaveBeenCalledOnce();
    expect(onDeleteTransaction).toHaveBeenCalledWith("swipe-test");
  });

  it("opens the delete action after a short swipe and deletes when pressed", () => {
    vi.useFakeTimers();
    const onDeleteTransaction = vi.fn();
    render(
      <TransactionHistory
        monthlyData={[transaction]}
        onDeleteTransaction={onDeleteTransaction}
        onEditTransaction={vi.fn()}
        onSelectGroup={vi.fn()}
      />,
    );
    const row = screen.getByText("表示確認用").closest<HTMLElement>(".swipe-front")!;
    const swipeRow = row.closest<HTMLElement>(".swipe-row")!;
    vi.spyOn(swipeRow, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
    row.setPointerCapture = vi.fn();
    row.hasPointerCapture = vi.fn(() => true);
    row.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 240, clientY: 100 });
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 240, clientY: 100 });
    act(() => vi.advanceTimersByTime(320));
    expect(swipeRow.classList.contains("is-open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(onDeleteTransaction).toHaveBeenCalledWith("swipe-test");
  });

  it("signals the full-swipe threshold before deletion is committed", () => {
    const onDeleteTransaction = vi.fn();
    const { container } = render(
      <TransactionHistory
        monthlyData={[transaction]}
        onDeleteTransaction={onDeleteTransaction}
        onEditTransaction={vi.fn()}
        onSelectGroup={vi.fn()}
      />,
    );
    const list = container.querySelector<HTMLElement>(".history-list")!;
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 400 });
    const row = screen.getByText("表示確認用").closest<HTMLElement>(".swipe-front")!;
    const swipeRow = row.closest<HTMLElement>(".swipe-row")!;
    vi.spyOn(swipeRow, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
    row.setPointerCapture = vi.fn();
    row.hasPointerCapture = vi.fn(() => true);
    row.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 380, clientY: 100 });
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 120, clientY: 100 });
    expect(swipeRow.classList.contains("is-full-swipe")).toBe(false);
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 40, clientY: 100 });
    expect(swipeRow.classList.contains("is-full-swipe")).toBe(true);
    expect(swipeRow.style.getPropertyValue("--history-swipe-offset")).toBe("-340px");
    fireEvent.pointerCancel(row, { pointerId: 1 });
    expect(onDeleteTransaction).not.toHaveBeenCalled();
  });
});
