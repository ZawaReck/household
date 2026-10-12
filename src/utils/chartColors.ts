import type { Category } from "../types/Category";

export const ACCOUNT_COLORS: Readonly<Record<string, string>> = {
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
};

export const EXPENSE_CATEGORY_COLORS: Readonly<Record<string, string>> = {
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
};

export const INCOME_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  月収: "#2E7D32",
  臨時収入: "#B5CC18",
  副次収入: "#00897B",
  その他: "#90A4AE",
};

const FALLBACK_COLORS = [
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
] as const;

const fallbackColor = (key: string) => {
  let hash = 0;
  for (const character of key) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
};

export const accountColor = (name: string) => ACCOUNT_COLORS[name] ?? fallbackColor(`account:${name}`);

export const categoryColor = (name: string, type: Category["type"]) => {
  const colors = type === "income" ? INCOME_CATEGORY_COLORS : EXPENSE_CATEGORY_COLORS;
  return colors[name] ?? fallbackColor(`${type}:${name}`);
};
