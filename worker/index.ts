import { createRemoteJWKSet, jwtVerify } from "jose";
import webpush from "web-push";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  ALLOWED_EMAILS: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

type SyncRecord = { key: string; value: unknown; updatedAt: string; deletedAt?: string | null };
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const authenticate = async (request: Request, env: Env) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing_token");
  const { payload } = await jwtVerify(token, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
  });
  const email = String(payload.email ?? "").toLowerCase();
  const allowed = env.ALLOWED_EMAILS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!payload.email_verified || !allowed.includes(email) || !payload.sub) throw new Error("forbidden");
  return String(payload.sub);
};

const handleApi = async (request: Request, env: Env) => {
  let userId: string;
  try { userId = await authenticate(request, env); }
  catch { return json({ error: "unauthorized" }, 401); }

  const url = new URL(request.url);
  if (url.pathname === "/api/auth/me") return json({ authenticated: true });
  if (url.pathname === "/api/push/public-key" && request.method === "GET") return json({ publicKey: env.VAPID_PUBLIC_KEY });
  if (url.pathname === "/api/push/subscriptions" && request.method === "POST") {
    const subscription = await request.json<{ endpoint?: string }>();
    if (!subscription.endpoint || !subscription.endpoint.startsWith("https://")) return json({ error: "invalid_subscription" }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, subscription_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, endpoint) DO UPDATE SET subscription_json = excluded.subscription_json, updated_at = excluded.updated_at`)
      .bind(userId, subscription.endpoint, JSON.stringify(subscription), now, now).run();
    return json({ ok: true });
  }
  if (url.pathname === "/api/push/subscriptions" && request.method === "DELETE") {
    const body = await request.json<{ endpoint?: string }>();
    if (!body.endpoint) return json({ error: "invalid_subscription" }, 400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(userId, body.endpoint).run();
    return json({ ok: true });
  }
  if (url.pathname !== "/api/sync") return json({ error: "not_found" }, 404);

  const requestedEpoch = request.method === "GET"
    ? request.headers.get("x-data-epoch") ?? ""
    : "";

  if (request.method === "GET") {
    const epochRow = await env.DB.prepare("SELECT data_epoch FROM sync_epochs WHERE user_id = ?").bind(userId).first<{ data_epoch: string }>();
    if (!requestedEpoch && epochRow) return json({ error: "client_update_required", dataEpoch: epochRow.data_epoch }, 409);
    const effectiveEpoch = requestedEpoch || "legacy";
    if (!epochRow && requestedEpoch) {
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sync_epochs (user_id, data_epoch, updated_at) VALUES (?, ?, ?)").bind(userId, effectiveEpoch, now),
        env.DB.prepare("UPDATE sync_records SET data_epoch = ? WHERE user_id = ? AND data_epoch = 'legacy'").bind(effectiveEpoch, userId),
      ]);
    } else if (epochRow && epochRow.data_epoch !== effectiveEpoch) {
      return json({ error: "data_epoch_mismatch", dataEpoch: epochRow.data_epoch }, 409);
    }
    const since = url.searchParams.get("since") ?? "";
    const serverTime = new Date().toISOString();
    const result = await env.DB.prepare(
      "SELECT record_key, value_json, updated_at, deleted_at FROM sync_records WHERE user_id = ? AND data_epoch = ? AND updated_at > ? ORDER BY updated_at"
    ).bind(userId, effectiveEpoch, since).all();
    return json({ records: result.results.map((row) => ({
      key: row.record_key,
      value: row.value_json == null ? null : JSON.parse(String(row.value_json)),
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    })), serverTime });
  }

  if (request.method === "PUT") {
    const body = await request.json<{ records?: SyncRecord[]; dataEpoch?: string; replaceEpoch?: boolean }>();
    if (!Array.isArray(body.records) || body.records.length > 500) return json({ error: "invalid_records" }, 400);
    const epochRow = await env.DB.prepare("SELECT data_epoch FROM sync_epochs WHERE user_id = ?").bind(userId).first<{ data_epoch: string }>();
    if (!body.dataEpoch && epochRow) return json({ error: "client_update_required", dataEpoch: epochRow.data_epoch }, 409);
    const effectiveEpoch = body.dataEpoch || "legacy";
    if (epochRow && epochRow.data_epoch !== effectiveEpoch && !body.replaceEpoch) {
      return json({ error: "data_epoch_mismatch", dataEpoch: epochRow.data_epoch }, 409);
    }
    const now = new Date().toISOString();
    const statements = body.records.map((record) => env.DB.prepare(
      `INSERT INTO sync_records (user_id, record_key, value_json, updated_at, deleted_at, data_epoch)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, record_key) DO UPDATE SET
         value_json = excluded.value_json, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, data_epoch = excluded.data_epoch
       WHERE excluded.updated_at >= sync_records.updated_at`
    ).bind(userId, record.key, record.deletedAt ? null : JSON.stringify(record.value), record.updatedAt, record.deletedAt ?? null, effectiveEpoch));
    const epochStatement = env.DB.prepare(
      `INSERT INTO sync_epochs (user_id, data_epoch, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data_epoch = excluded.data_epoch, updated_at = excluded.updated_at`
    ).bind(userId, effectiveEpoch, now);
    const prefix = body.replaceEpoch
      ? [env.DB.prepare("DELETE FROM sync_records WHERE user_id = ?").bind(userId), epochStatement]
      : body.dataEpoch ? [epochStatement] : [];
    await env.DB.batch([...prefix, ...statements]);
    return json({ ok: true });
  }
  return json({ error: "method_not_allowed" }, 405);
};

const getJstParts = (timestamp: number) => {
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (value: number) => String(value).padStart(2, "0");
const latestReminderMonth = (timestamp: number) => {
  const current = getJstParts(timestamp);
  if (current.day === lastDay(current.year, current.month)) return `${current.year}-${pad(current.month)}`;
  const previous = current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 };
  return `${previous.year}-${pad(previous.month)}`;
};
const nextMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const value = Number(month.slice(5, 7));
  return value === 12 ? `${year + 1}-01` : `${year}-${pad(value + 1)}`;
};

const needsMonthEndUpdate = (records: Record<string, unknown>, month: string) => {
  const monthEnd = `${month}-${pad(lastDay(Number(month.slice(0, 4)), Number(month.slice(5, 7))))}`;
  const accounts = Array.isArray(records["accounts.v1"]) ? records["accounts.v1"] as Array<Record<string, unknown>> : [];
  const actualState = records.accountActualBalances as { byMonth?: Record<string, Record<string, number>>; confirmedByMonth?: Record<string, string[]> } | undefined;
  const investmentState = records.investments as { snapshots?: Array<{ date: string; values: Record<string, number> }> } | undefined;
  const transactions = Array.isArray(records.transactions) ? records.transactions as Array<Record<string, unknown>> : [];
  const snapshot = investmentState?.snapshots?.find((item) => item.date === monthEnd);
  return accounts.some((account) => {
    const disabledAt = String(account.disabledAt ?? "");
    const activeAtMonthEnd = Boolean(account.isActive) || Boolean(disabledAt && disabledAt > monthEnd);
    if (!activeAtMonthEnd || String(account.openingDate ?? "") > monthEnd) return false;
    if (account.kind === "investment") return snapshot?.values?.[String(account.id)] == null;
    const accountName = String(account.name);
    const confirmed = (actualState?.confirmedByMonth?.[month] ?? []).includes(accountName);
    if (account.kind !== "credit_card") return !confirmed;
    const used = transactions.reduce((sum, transaction) => {
      if (String(transaction.date ?? "") > monthEnd) return sum;
      const cardCycle = transaction.cardCycle as { cardAccountId?: string } | undefined;
      const isAfterOpening = String(transaction.date ?? "") > String(account.openingDate ?? "");
      if (transaction.type === "expense" && !transaction.system && transaction.source === accountName && (isAfterOpening || cardCycle?.cardAccountId === String(account.id))) return sum + Number(transaction.amount ?? 0);
      const system = transaction.system as { kind?: string } | undefined;
      if (transaction.type === "move" && transaction.destination === accountName && system?.kind === "card_payment") return sum - Number(transaction.amount ?? 0);
      return sum;
    }, 0);
    const creditCard = account.creditCard as { limit?: number } | undefined;
    const available = Number(creditCard?.limit ?? 0) - used;
    return !confirmed || actualState?.byMonth?.[month]?.[accountName] !== available;
  });
};

const oldestIncompleteMonth = (records: Record<string, unknown>, latestMonth: string) => {
  const accounts = Array.isArray(records["accounts.v1"]) ? records["accounts.v1"] as Array<Record<string, unknown>> : [];
  const openingMonths = accounts.map((account) => String(account.openingDate ?? "").slice(0, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month)).sort();
  let month = openingMonths[0] ?? latestMonth;
  while (month <= latestMonth) {
    if (needsMonthEndUpdate(records, month)) return month;
    month = nextMonth(month);
  }
  return null;
};

const sendMonthEndReminders = async (controller: ScheduledController, env: Env) => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  const subscriptions = await env.DB.prepare("SELECT user_id, endpoint, subscription_json FROM push_subscriptions").all();
  const latestMonth = latestReminderMonth(controller.scheduledTime);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  for (const row of subscriptions.results) {
    const recordRows = await env.DB.prepare("SELECT record_key, value_json FROM sync_records WHERE user_id = ? AND deleted_at IS NULL").bind(row.user_id).all();
    const records = Object.fromEntries(recordRows.results.map((record) => [String(record.record_key), record.value_json == null ? null : JSON.parse(String(record.value_json))]));
    const month = oldestIncompleteMonth(records, latestMonth);
    if (!month) continue;
    try {
      await webpush.sendNotification(JSON.parse(String(row.subscription_json)), JSON.stringify({ title: "家計簿 月末更新", body: `${month}の残高更新が未完了です。`, url: "/graphs?tab=portfolio" }));
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(row.user_id, row.endpoint).run();
    }
  }
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (/\/(?:[^/]+\.)?local(?:\.[^/]+)?$/i.test(url.pathname)) {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env) {
    await sendMonthEndReminders(controller, env);
  },
} satisfies ExportedHandler<Env>;
