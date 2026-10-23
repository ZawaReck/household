import type { Account } from "../src/types/Account";
import type { InvestmentState } from "../src/types/Investment";
import type { Transaction } from "../src/types/Transaction";
import { authenticateIntegrationRequest } from "./integrationAuth";
import {
  buildBalanceResponse,
  buildCategoriesResponse,
  buildSummaryResponse,
  isValidDate,
  isValidMonth,
  isValidTransactionType,
  jstDateISO,
  type IntegrationRecords,
} from "./integrationData";

export type IntegrationEnv = {
  DB: D1Database;
  INTEGRATION_JWKS?: string;
  INTEGRATION_JWT_ISSUER?: string;
  INTEGRATION_JWT_AUDIENCE?: string;
  INTEGRATION_USER_ID?: string;
};

type StoredRecord = {
  record_key: string;
  value_json: string | null;
  updated_at: string;
  deleted_at: string | null;
};

const RATE_LIMIT_PER_MINUTE = 30;
const AUDIT_RETENTION_DAYS = 90;

const responseHeaders = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: { ...responseHeaders, ...headers },
});
const errorResponse = (error: string, status: number, headers?: HeadersInit) => json({ error }, status, headers);

const isConfigured = (env: IntegrationEnv) => Boolean(
  env.INTEGRATION_JWKS &&
  env.INTEGRATION_JWT_ISSUER &&
  env.INTEGRATION_JWT_AUDIENCE &&
  env.INTEGRATION_USER_ID
);

const auditRequest = async (
  env: IntegrationEnv,
  caller: string,
  operation: string,
  target: string,
  status: number,
  createdAt: string,
) => {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO integration_api_audit (caller, operation, target, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(caller, operation, target, status, createdAt),
    env.DB.prepare("DELETE FROM integration_api_audit WHERE created_at < ?")
      .bind(new Date(Date.parse(createdAt) - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()),
  ]);
};

const isRateLimited = async (env: IntegrationEnv, caller: string, now: string) => {
  const since = new Date(Date.parse(now) - 60_000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS request_count FROM integration_api_audit WHERE caller = ? AND created_at >= ?"
  ).bind(caller, since).first<{ request_count: number }>();
  return Number(row?.request_count ?? 0) >= RATE_LIMIT_PER_MINUTE;
};

const parseArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const loadRecords = async (env: IntegrationEnv, userId: string) => {
  const result = await env.DB.prepare(
    `SELECT record_key, value_json, updated_at, deleted_at
     FROM sync_records
     WHERE user_id = ?
       AND data_epoch = (SELECT data_epoch FROM sync_epochs WHERE user_id = ?)
       AND record_key IN ('transactions', 'accounts.v1', 'investments')`
  ).bind(userId, userId).all<StoredRecord>();
  const rows = new Map(result.results.map((row) => [row.record_key, row]));
  const transactionsRow = rows.get("transactions");
  const accountsRow = rows.get("accounts.v1");
  if (!transactionsRow || transactionsRow.deleted_at || transactionsRow.value_json == null ||
      !accountsRow || accountsRow.deleted_at || accountsRow.value_json == null) {
    throw new Error("data_unavailable");
  }
  const investmentsRow = rows.get("investments");
  const transactionsValue = JSON.parse(transactionsRow.value_json) as unknown;
  const accountsValue = JSON.parse(accountsRow.value_json) as unknown;
  const investmentsValue = investmentsRow?.deleted_at || investmentsRow?.value_json == null
    ? null
    : JSON.parse(investmentsRow.value_json) as unknown;
  if (!Array.isArray(transactionsValue) || !Array.isArray(accountsValue)) throw new Error("data_invalid");
  const investmentState = investmentsValue && typeof investmentsValue === "object"
    ? investmentsValue as Partial<InvestmentState>
    : {};
  const base: Omit<IntegrationRecords, "dataUpdatedAt"> = {
    transactions: parseArray<Transaction>(transactionsValue),
    accounts: parseArray<Account>(accountsValue),
    investments: {
      assets: parseArray(investmentState.assets),
      contributions: parseArray(investmentState.contributions),
      snapshots: parseArray(investmentState.snapshots),
      updatedAtISO: investmentState.updatedAtISO,
    },
  };
  return {
    base,
    summaryUpdatedAt: transactionsRow.updated_at,
    balancesUpdatedAt: [transactionsRow, accountsRow, investmentsRow]
      .filter((row): row is StoredRecord => Boolean(row))
      .map((row) => row.updated_at)
      .sort()
      .at(-1) ?? transactionsRow.updated_at,
  };
};

const hasOnlyQuery = (url: URL, expected: string) =>
  Array.from(url.searchParams.keys()).every((key) => key === expected) && url.searchParams.getAll(expected).length === 1;

const hasOnlyQueries = (url: URL, expected: string[]) =>
  Array.from(url.searchParams.keys()).every((key) => expected.includes(key)) &&
  expected.every((key) => url.searchParams.getAll(key).length === 1);

export const handleIntegrationApi = async (request: Request, env: IntegrationEnv) => {
  if (!isConfigured(env)) return errorResponse("integration_unavailable", 503);
  let caller: string;
  try {
    ({ caller } = await authenticateIntegrationRequest(request, {
      jwks: env.INTEGRATION_JWKS!,
      issuer: env.INTEGRATION_JWT_ISSUER!,
      audience: env.INTEGRATION_JWT_AUDIENCE!,
    }));
  } catch {
    return errorResponse("unauthorized", 401);
  }

  const generatedAt = new Date().toISOString();
  if (await isRateLimited(env, caller, generatedAt)) {
    await auditRequest(env, caller, "rate_limited", "-", 429, generatedAt);
    return errorResponse("rate_limited", 429, { "retry-after": "60" });
  }

  const url = new URL(request.url);
  let operation = "unknown";
  let target = "-";
  let response: Response;
  try {
    if (request.method !== "GET") {
      response = errorResponse("method_not_allowed", 405, { allow: "GET" });
    } else if (url.pathname === "/api/integrations/summary") {
      operation = "summary";
      const month = url.searchParams.get("month") ?? "";
      target = month.slice(0, 32) || "-";
      const today = jstDateISO();
      if (!hasOnlyQuery(url, "month") || !isValidMonth(month) || month > today.slice(0, 7)) {
        response = errorResponse("invalid_month", 400);
      } else {
        const loaded = await loadRecords(env, env.INTEGRATION_USER_ID!);
        response = json(buildSummaryResponse({ ...loaded.base, dataUpdatedAt: loaded.summaryUpdatedAt }, month, today, generatedAt));
      }
    } else if (url.pathname === "/api/integrations/balances") {
      operation = "balances";
      const asOf = url.searchParams.get("asOf") ?? "";
      target = asOf.slice(0, 32) || "-";
      const today = jstDateISO();
      if (!hasOnlyQuery(url, "asOf") || !isValidDate(asOf) || asOf > today) {
        response = errorResponse("invalid_date", 400);
      } else {
        const loaded = await loadRecords(env, env.INTEGRATION_USER_ID!);
        response = json(buildBalanceResponse({ ...loaded.base, dataUpdatedAt: loaded.balancesUpdatedAt }, asOf, generatedAt));
      }
    } else if (url.pathname === "/api/integrations/categories") {
      operation = "categories";
      const month = url.searchParams.get("month") ?? "";
      const type = url.searchParams.get("type") ?? "";
      target = month || type ? `${month.slice(0, 7)}:${type.slice(0, 16)}` : "-";
      const today = jstDateISO();
      if (!hasOnlyQueries(url, ["month", "type"]) || !isValidMonth(month) || month > today.slice(0, 7)) {
        response = errorResponse("invalid_month", 400);
      } else if (!isValidTransactionType(type)) {
        response = errorResponse("invalid_type", 400);
      } else {
        const loaded = await loadRecords(env, env.INTEGRATION_USER_ID!);
        response = json(buildCategoriesResponse(
          { ...loaded.base, dataUpdatedAt: loaded.summaryUpdatedAt },
          month,
          type,
          today,
          generatedAt,
        ));
      }
    } else {
      response = errorResponse("not_found", 404);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    response = errorResponse(code === "data_unavailable" ? "data_unavailable" : "internal_error", code === "data_unavailable" ? 409 : 500);
  }
  await auditRequest(env, caller, operation, target, response.status, generatedAt);
  return response;
};
