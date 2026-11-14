// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../src/types/Account";
import type { Transaction } from "../src/types/Transaction";
import { GraphsPage } from "../src/components/GraphsPage";

const accounts: Account[] = ["投資A", "投資B"].map((name, index) => ({
  id: `investment-${index}`,
  name,
  kind: "investment",
  openingBalance: 100_000,
  openingDate: "2026-01-01",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

describe("investment chart animation performance", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    localStorage.clear();
    window.history.replaceState(null, "", "/graphs?tab=invest&month=2026-11");
    localStorage.setItem("investments", JSON.stringify({
      assets: [],
      contributions: [],
      snapshots: [
        { id: "one", date: "2026-09-30", values: { "investment-0": 110_000, "investment-1": 90_000 } },
        { id: "two", date: "2026-10-31", values: { "investment-0": 95_000, "investment-1": 105_000 } },
      ],
    }));
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not rerun page analytics on animation frames", () => {
    let transactionReads = 0;
    const transactions = new Proxy([] as Transaction[], {
      get(target, property, receiver) {
        if (property === "length") transactionReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    render(<GraphsPage
      transactions={transactions}
      showFutureTransactions={false}
      onShowFutureTransactionsChange={vi.fn()}
      includeExcludedAnalytics={false}
      onIncludeExcludedAnalyticsChange={vi.fn()}
      setTransactions={vi.fn()}
      accounts={accounts}
      categories={[]}
    />);
    const callsBeforeToggle = transactionReads;
    fireEvent.click(screen.getByRole("checkbox", { name: "投資Aを評価額推移に表示" }));
    const callsAfterToggle = transactionReads;
    expect(callsAfterToggle).toBeGreaterThan(callsBeforeToggle);
    expect(frames.size).toBeGreaterThan(0);
    const frameStart = performance.now();
    for (const offset of [32, 64, 96, 128, 160, 192]) {
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(frameStart + offset));
      });
    }
    expect(transactionReads).toBe(callsAfterToggle);
  });
});
