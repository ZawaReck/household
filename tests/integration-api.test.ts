import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Account } from "../src/types/Account";
import type { Transaction } from "../src/types/Transaction";
import { authenticateIntegrationRequest } from "../worker/integrationAuth";
import {
  buildBalanceResponse,
  buildCategoriesResponse,
  buildSummaryResponse,
  isValidDate,
  isValidMonth,
  isValidTransactionType,
  type IntegrationRecords,
} from "../worker/integrationData";

const account = (partial: Partial<Account> & Pick<Account, "id" | "name" | "kind">): Account => ({
  openingBalance: 0,
  openingDate: "2026-09-01",
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...partial,
});

const transaction = (partial: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount" | "date">): Transaction => ({
  name: "test",
  category: "その他",
  source: "銀行",
  destination: "",
  memo: "",
  isSpecial: false,
  classification: "normal",
  ...partial,
});

const records = (overrides: Partial<IntegrationRecords> = {}): IntegrationRecords => ({
  transactions: [],
  accounts: [],
  investments: { assets: [], contributions: [], snapshots: [] },
  dataUpdatedAt: "2026-10-22T00:00:00.000Z",
  ...overrides,
});

const authFixture = async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const publicJwk = { ...await exportJWK(publicKey), alg: "EdDSA", use: "sig", kid: "life-staging-2026-10" };
  const privateJwk = { ...await exportJWK(privateKey), alg: "EdDSA", use: "sig", kid: "life-staging-2026-10" };
  const config = {
    jwks: JSON.stringify({ keys: [publicJwk] }),
    issuer: "life-staging",
    audience: "household-staging-integrations",
  };
  const now = 1_798_000_000;
  const sign = (overrides: Record<string, unknown> = {}, lifetimeSeconds = 60) => new SignJWT({
    scope: "household:read",
    htm: "GET",
    htu: "https://household-staging.example/api/integrations/summary?month=2026-10",
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: privateJwk.kid })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject("life-mcp")
    .setJti("0123456789abcdef")
    .setIssuedAt(now)
    .setExpirationTime(now + lifetimeSeconds)
    .sign(privateKey);
  return { config, now, sign };
};

describe("integration API authentication", () => {
  it("accepts a short-lived Ed25519 JWT bound to the exact request", async () => {
    const { config, now, sign } = await authFixture();
    const request = new Request("https://household-staging.example/api/integrations/summary?month=2026-10", {
      headers: { authorization: `Bearer ${await sign()}` },
    });
    await expect(authenticateIntegrationRequest(request, config, now)).resolves.toMatchObject({
      caller: "life-staging:life-mcp",
      tokenId: "0123456789abcdef",
    });
  });

  it("rejects a JWT used for a different request target", async () => {
    const { config, now, sign } = await authFixture();
    const request = new Request("https://household-staging.example/api/integrations/balances?asOf=2026-10-22", {
      headers: { authorization: `Bearer ${await sign()}` },
    });
    await expect(authenticateIntegrationRequest(request, config, now)).rejects.toThrow("integration_request_mismatch");
  });

  it("rejects tokens whose lifetime exceeds 60 seconds", async () => {
    const { config, now, sign } = await authFixture();
    const token = await sign({}, 61);
    const request = new Request("https://household-staging.example/api/integrations/summary?month=2026-10", {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(authenticateIntegrationRequest(request, config, now)).rejects.toThrow("invalid_integration_lifetime");
  });

  it("rejects private key material in the household JWKS", async () => {
    const { config, now, sign } = await authFixture();
    const token = await sign();
    const publicSet = JSON.parse(config.jwks) as { keys: Array<Record<string, unknown>> };
    publicSet.keys[0].d = "must-not-be-stored";
    const request = new Request("https://household-staging.example/api/integrations/summary?month=2026-10", {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(authenticateIntegrationRequest(request, { ...config, jwks: JSON.stringify(publicSet) }, now))
      .rejects.toThrow("invalid_jwks");
  });
});

describe("integration API validation", () => {
  it("accepts only strict supported month and date values", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("1999-12")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidTransactionType("expense")).toBe(true);
    expect(isValidTransactionType("income")).toBe(true);
    expect(isValidTransactionType("move")).toBe(false);
  });
});

describe("integration categories", () => {
  it("returns expense category totals and detail rows using the graph calculation rules", () => {
    const result = buildCategoriesResponse(records({
      transactions: [
        transaction({ id: "food", type: "expense", amount: 100, date: "2026-10-01", name: "食品", category: "食料品費", memo: "memo" }),
        transaction({ id: "book", type: "expense", amount: 200, date: "2026-10-02", name: "本", category: "教養費" }),
        transaction({ id: "special", type: "expense", amount: 300, date: "2026-10-03", category: "趣味費", classification: "special" }),
        transaction({ id: "future", type: "expense", amount: 400, date: "2026-10-23", category: "雑貨費" }),
        transaction({ id: "income", type: "income", amount: 500, date: "2026-10-04", category: "月収" }),
      ],
    }), "2026-10", "expense", "2026-10-22", "2026-10-22T12:00:00.000Z");

    expect(result).toMatchObject({
      total: 300,
      period: { month: "2026-10", end: "2026-10-22", complete: false },
      inclusion: { classifications: ["normal"], transactionType: "expense", investmentProfit: false },
    });
    expect(result.categories).toEqual([
      {
        name: "食料品費",
        total: 100,
        transactionCount: 1,
        transactions: [{ id: "food", date: "2026-10-01", name: "食品", amount: 100, source: "銀行", memo: "memo" }],
      },
      {
        name: "教養費",
        total: 200,
        transactionCount: 1,
        transactions: [{ id: "book", date: "2026-10-02", name: "本", amount: 200, source: "銀行", memo: "" }],
      },
    ]);
  });

  it("returns income categories and excludes investment profit", () => {
    const result = buildCategoriesResponse(records({
      transactions: [
        transaction({ id: "salary", type: "income", amount: 500, date: "2026-09-25", category: "月収" }),
        transaction({ id: "side", type: "income", amount: 100, date: "2026-09-20", category: "副次収入" }),
        transaction({ id: "profit", type: "income", amount: 80, date: "2026-09-20", category: "その他", system: { kind: "investment_profit", key: "profit" } }),
      ],
    }), "2026-09", "income", "2026-10-22", "2026-10-22T12:00:00.000Z");

    expect(result.total).toBe(600);
    expect(result.categories.map(({ name, total }) => ({ name, total }))).toEqual([
      { name: "月収", total: 500 },
      { name: "副次収入", total: 100 },
    ]);
  });
});

describe("integration summary", () => {
  it("matches default calendar analytics and excludes future days in the current month", () => {
    const result = buildSummaryResponse(records({
      transactions: [
        transaction({ id: "income", type: "income", amount: 300, date: "2026-10-01" }),
        transaction({ id: "expense", type: "expense", amount: 100, date: "2026-10-20" }),
        transaction({ id: "special", type: "expense", amount: 50, date: "2026-10-20", classification: "special" }),
        transaction({ id: "future", type: "expense", amount: 75, date: "2026-10-23" }),
        transaction({ id: "profit", type: "income", amount: 80, date: "2026-10-20", system: { kind: "investment_profit", key: "profit" } }),
      ],
    }), "2026-10", "2026-10-22", "2026-10-22T12:00:00.000Z");

    expect(result).toMatchObject({
      income: 300,
      expense: 100,
      net: 200,
      period: { month: "2026-10", start: "2026-10-01", end: "2026-10-22", complete: false },
      inclusion: { classifications: ["normal"], investmentProfit: false },
    });
  });

  it("returns the full end date for a completed month", () => {
    const result = buildSummaryResponse(records(), "2026-09", "2026-10-22", "2026-10-22T12:00:00.000Z");
    expect(result.period).toEqual({ month: "2026-09", start: "2026-09-01", end: "2026-09-30", complete: true });
  });
});

describe("integration balances", () => {
  it("returns liquid assets, investments and card debt without subtracting cards from total assets", () => {
    const accounts = [
      account({ id: "bank", name: "銀行", kind: "bank", openingBalance: 1_000 }),
      account({ id: "investment", name: "投資", kind: "investment", openingBalance: 500 }),
      account({ id: "card", name: "カード", kind: "credit_card", creditCard: { limit: 100_000, closingDay: 31, paymentDay: 27, paymentDelayMonths: 1 } }),
    ];
    const result = buildBalanceResponse(records({
      accounts,
      transactions: [
        transaction({ id: "expense", type: "expense", amount: 100, date: "2026-10-01", source: "銀行" }),
        transaction({ id: "card-expense", type: "expense", amount: 200, date: "2026-10-02", source: "カード" }),
      ],
      investments: { assets: [], contributions: [], snapshots: [{ id: "snapshot", date: "2026-10-01", values: { investment: 600 } }] },
    }), "2026-10-22", "2026-10-22T12:00:00.000Z");

    expect(result).toMatchObject({
      breakdownAvailable: true,
      totalAssets: 1_500,
      liquidAssets: 900,
      creditCardOutstanding: 200,
    });
    expect(result.accounts).toEqual([
      { id: "bank", name: "銀行", kind: "bank", balance: 900, outstanding: null, includedInTotalAssets: true },
      { id: "investment", name: "投資", kind: "investment", balance: 600, outstanding: null, includedInTotalAssets: true },
      { id: "card", name: "カード", kind: "credit_card", balance: null, outstanding: 200, includedInTotalAssets: false },
    ]);
  });

  it("does not invent an account breakdown before the operation start date", () => {
    const result = buildBalanceResponse(records({
      accounts: [account({ id: "bank", name: "銀行", kind: "bank", openingBalance: 1_000, openingDate: "2026-09-23" })],
      transactions: [transaction({ id: "old", type: "expense", amount: 100, date: "2026-08-01", source: "" })],
    }), "2026-08-31", "2026-10-22T12:00:00.000Z");

    expect(result.breakdownAvailable).toBe(false);
    expect(result.totalAssets).toBe(1_000);
    expect(result.liquidAssets).toBeNull();
    expect(result.creditCardOutstanding).toBeNull();
    expect(result.accounts).toEqual([]);
  });
});
