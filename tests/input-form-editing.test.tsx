// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InputForm } from "../src/components/InputForm";
import type { Account } from "../src/types/Account";
import type { Category } from "../src/types/Category";
import type { Transaction } from "../src/types/Transaction";

const accounts: Account[] = ["財布", "銀行", "貯蓄"].map((name, index) => ({
  id: `account-${index}`,
  name,
  kind: index === 0 ? "cash" : "bank",
  openingBalance: 0,
  openingDate: "2026-09-01",
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}));

const categories: Category[] = [
  { id: "food", name: "食費", type: "expense", isActive: true },
  { id: "daily", name: "日用品", type: "expense", isActive: true },
  { id: "salary", name: "給与", type: "income", isActive: true },
].map((category) => ({
  ...category,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}));

const expense: Transaction = {
  id: "expense-1",
  type: "expense",
  amount: 1200,
  date: "2026-09-23",
  name: "昼食",
  category: "食費",
  source: "財布",
  destination: "",
  memo: "元のメモ",
  isSpecial: false,
  classification: "normal",
  taxMode: "exclusive",
  taxRate: 10,
};

let mobileViewport = true;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: mobileViewport && query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(options: ScrollToOptions | number) {
      this.scrollTop = typeof options === "number" ? options : options.top ?? this.scrollTop;
      this.dispatchEvent(new Event("scroll"));
    },
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  mobileViewport = true;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function EditingHarness({ transaction, onUpdate = vi.fn(), onSetEditing = vi.fn() }: {
  transaction: Transaction;
  onUpdate?: (transaction: Transaction) => void;
  onSetEditing?: (transaction: Transaction | null) => void;
}) {
  const [renderCount, setRenderCount] = React.useState(0);
  const reportDirty = React.useCallback(() => setRenderCount((count) => count + 1), []);
  return <>
    <output data-testid="parent-renders">{renderCount}</output>
    <InputForm
      onAddTransaction={vi.fn()}
      onUpdateTransaction={onUpdate}
      onDeleteTransaction={vi.fn()}
      onDeleteReceipt={() => true}
      editingTransaction={transaction}
      setEditingTransaction={onSetEditing}
      selectedDate="2026-09-23"
      monthlyData={[transaction]}
      accounts={accounts}
      categories={categories}
      onEditingDirtyChange={reportDirty}
    />
  </>;
}

describe("InputForm existing transaction editing", () => {
  it("keeps every editable expense field after mobile-triggered parent rerenders", async () => {
    const onUpdate = vi.fn();
    render(<EditingHarness transaction={expense} onUpdate={onUpdate} />);

    const name = screen.getByPlaceholderText("摘要") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "夕食" } });
    await waitFor(() => expect(name.value).toBe("夕食"));

    const amount = screen.getByPlaceholderText("金額") as HTMLInputElement;
    fireEvent.pointerDown(amount);
    fireEvent.pointerDown(screen.getByRole("button", { name: "9" }));
    await waitFor(() => expect(amount.value).toBe("12009"));

    fireEvent.click(screen.getByRole("button", { name: /日付/ }));
    const dayWheel = screen.getByRole("listbox", { name: "日" });
    fireEvent.click(within(dayWheel).getByRole("option", { name: "24日" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /日付/ }).textContent).toContain("09/24"));

    fireEvent.change(screen.getByRole("combobox", { name: "集計区分" }), { target: { value: "special" } });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "集計区分" }) as HTMLSelectElement).value).toBe("special"));

    fireEvent.click(screen.getByRole("radio", { name: "日用品" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "日用品" }).getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(screen.getByRole("button", { name: /拠出元/ }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "拠出元" })).getByRole("option", { name: "銀行" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /拠出元/ }).textContent).toContain("銀行"));

    const memo = screen.getByPlaceholderText("Memo") as HTMLInputElement;
    fireEvent.change(memo, { target: { value: "変更後のメモ" } });
    await waitFor(() => expect(memo.value).toBe("変更後のメモ"));

    fireEvent.click(screen.getByRole("radio", { name: "8%" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "8%" }).getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(screen.getByRole("radio", { name: "一括内税" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "一括内税" }).getAttribute("aria-checked")).toBe("true"));

    expect(Number(screen.getByTestId("parent-renders").textContent)).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Out" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("手数料等")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: expense.id,
      amount: 12009,
      date: "2026-09-24",
      name: "夕食",
      category: "日用品",
      source: "銀行",
      memo: "変更後のメモ",
      classification: "special",
      taxMode: "inclusive",
      taxRate: 8,
    }));
  });

  it("keeps both Move account selections editable while its type stays fixed", async () => {
    const move: Transaction = {
      ...expense,
      id: "move-1",
      type: "move",
      name: "資金移動",
      category: "move",
      source: "財布",
      destination: "銀行",
      taxMode: undefined,
      taxRate: undefined,
    };
    const onUpdate = vi.fn();
    const onSetEditing = vi.fn();
    const { container } = render(<EditingHarness transaction={move} onUpdate={onUpdate} onSetEditing={onSetEditing} />);

    fireEvent.pointerDown(container.querySelector(".tab-group")!, { button: 0, clientX: 1, clientY: 1 });
    expect(onSetEditing).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /移動元/ }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "移動元" })).getByRole("option", { name: "貯蓄" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /移動元/ }).textContent).toContain("貯蓄"));

    fireEvent.click(screen.getByRole("button", { name: /移動先/ }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "移動先" })).getByRole("option", { name: "財布" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /移動先/ }).textContent).toContain("財布"));

    expect((screen.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("手数料等")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: move.id,
      source: "貯蓄",
      destination: "財布",
    }));
  });

  it.each([
    { device: "desktop", mobile: false },
    { device: "mobile", mobile: true },
  ])("clears the $device form after updating without deleting a saved draft", async ({ mobile }) => {
    mobileViewport = mobile;
    localStorage.setItem("drafts.v1", JSON.stringify([{
      id: "saved-draft",
      scope: "input",
      type: "expense",
      amount: "999",
      date: "2026-09-20",
      name: "復元されてはいけない下書き",
      category: "食費",
      source: "財布",
      sourceMove: "財布",
      destination: "銀行",
      memo: "保存済み",
      classification: "normal",
      moveFee: "",
      entryMode: "individual",
      taxRate: 10,
      receiptItems: [],
      editingReceiptIndex: null,
      updatedAt: "2026-09-28T00:00:00.000Z",
    }]));

    function ControlledEditor() {
      const [editing, setEditing] = React.useState<Transaction | null>(expense);
      const [transactions, setTransactions] = React.useState([expense]);
      return <InputForm
        onAddTransaction={vi.fn()}
        onUpdateTransaction={(updated) => setTransactions([updated])}
        onDeleteTransaction={vi.fn()}
        onDeleteReceipt={() => true}
        editingTransaction={editing}
        setEditingTransaction={setEditing}
        selectedDate="2026-09-23"
        monthlyData={[...transactions]}
        accounts={accounts}
        categories={categories}
      />;
    }

    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect((screen.getByPlaceholderText("摘要") as HTMLInputElement).value).toBe("");
      expect((screen.getByPlaceholderText("金額") as HTMLInputElement).value).toBe("");
      expect((screen.getByPlaceholderText("Memo") as HTMLInputElement).value).toBe("");
    });
    expect(JSON.parse(localStorage.getItem("drafts.v1") ?? "[]")[0].id).toBe("saved-draft");
  });
});
