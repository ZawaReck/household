import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  ALLOWED_EMAILS: string;
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
  if (url.pathname !== "/api/sync") return json({ error: "not_found" }, 404);

  if (request.method === "GET") {
    const since = url.searchParams.get("since") ?? "";
    const result = await env.DB.prepare(
      "SELECT record_key, value_json, updated_at, deleted_at FROM sync_records WHERE user_id = ? AND updated_at > ? ORDER BY updated_at"
    ).bind(userId, since).all();
    return json({ records: result.results.map((row) => ({
      key: row.record_key,
      value: row.value_json == null ? null : JSON.parse(String(row.value_json)),
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    })) });
  }

  if (request.method === "PUT") {
    const body = await request.json<{ records?: SyncRecord[] }>();
    if (!Array.isArray(body.records) || body.records.length > 500) return json({ error: "invalid_records" }, 400);
    const statements = body.records.map((record) => env.DB.prepare(
      `INSERT INTO sync_records (user_id, record_key, value_json, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, record_key) DO UPDATE SET
         value_json = excluded.value_json, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
       WHERE excluded.updated_at >= sync_records.updated_at`
    ).bind(userId, record.key, record.deletedAt ? null : JSON.stringify(record.value), record.updatedAt, record.deletedAt ?? null));
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true });
  }
  return json({ error: "method_not_allowed" }, 405);
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
