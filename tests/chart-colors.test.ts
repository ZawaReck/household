import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLORS,
  EXPENSE_CATEGORY_COLORS,
  INCOME_CATEGORY_COLORS,
  accountColor,
  categoryColor,
} from "../src/utils/chartColors";

describe("chart colors", () => {
  it("uses the approved account colors", () => {
    expect(ACCOUNT_COLORS).toEqual({
      PayPay: "#FF0033",
      PayPayクレカ: "#FF3B62",
      PayPay銀行: "#FD5C5C",
      PayPay円定期預金: "#FFB2B2",
      PayPayドル預金: "#F23099",
      PayPayポイント運用: "#FF4CAD",
      ゆうちょ銀行: "#69BE45",
      ゆうちょ円定期預金: "#009900",
      oliveクレカ: "#006B54",
      Suica: "#59B224",
      Trialプリカ: "#01377A",
      財布: "#D4A72C",
      手元現金: "#C58B2A",
      保管紙幣: "#8A6A2F",
      NISA口座: "#0E61D8",
      特定口座: "#FF6900",
      暗号資産: "#02A1DE",
      その他: "#7F8C8D",
    });
  });

  it("uses different approved colors for expense and income categories", () => {
    expect(EXPENSE_CATEGORY_COLORS).toEqual({
      食料品費: "#76A843",
      外食費: "#F28C28",
      教養費: "#3B73B9",
      趣味費: "#00A86B",
      雑貨費: "#2DB7C9",
      交通費旅費: "#D94B4B",
      服飾費: "#F4D35E",
      医療関係費: "#F4A7B9",
      交際費: "#E1B12C",
      その他: "#7F8C8D",
    });
    expect(INCOME_CATEGORY_COLORS).toEqual({
      月収: "#2E7D32",
      臨時収入: "#B5CC18",
      副次収入: "#00897B",
      その他: "#90A4AE",
    });
    expect(categoryColor("その他", "expense")).not.toBe(categoryColor("その他", "income"));
  });

  it("keeps fallback colors stable for names added later", () => {
    expect(accountColor("新しい口座")).toBe(accountColor("新しい口座"));
    expect(categoryColor("新しいカテゴリ", "expense")).toBe(categoryColor("新しいカテゴリ", "expense"));
    expect(accountColor("PayPay")).toBe("#FF0033");
  });

  it("defines valid hex colors", () => {
    const colors = [
      ...Object.values(ACCOUNT_COLORS),
      ...Object.values(EXPENSE_CATEGORY_COLORS),
      ...Object.values(INCOME_CATEGORY_COLORS),
    ];
    expect(colors.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });
});
