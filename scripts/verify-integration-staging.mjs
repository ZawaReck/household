import { importJWK, SignJWT } from "jose";

const STAGING_ORIGIN = "https://household-staging.ozw1504.workers.dev";
const mode = process.argv[2] ?? "connected";
const baseUrl = (process.env.HOUSEHOLD_API_BASE_URL ?? STAGING_ORIGIN).replace(/\/$/, "");
const month = process.env.HOUSEHOLD_TEST_MONTH ?? new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
const asOf = process.env.HOUSEHOLD_TEST_AS_OF ?? new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const privateJwkJson = process.env.HOUSEHOLD_INTEGRATION_PRIVATE_JWK ?? "";
const issuer = process.env.HOUSEHOLD_INTEGRATION_ISSUER ?? "life-staging";
const audience = process.env.HOUSEHOLD_INTEGRATION_AUDIENCE ?? "household-staging-integrations";

if (baseUrl !== STAGING_ORIGIN) throw new Error("Refusing to test a non-staging origin.");
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("HOUSEHOLD_TEST_MONTH must use YYYY-MM.");
if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(asOf)) throw new Error("HOUSEHOLD_TEST_AS_OF must use YYYY-MM-DD.");

const privateJwk = privateJwkJson ? JSON.parse(privateJwkJson) : null;
if (privateJwk && (!privateJwk.d || !privateJwk.kid || privateJwk.alg !== "EdDSA")) {
  throw new Error("HOUSEHOLD_INTEGRATION_PRIVATE_JWK must be an EdDSA private JWK with kid.");
}
const privateKey = privateJwk ? await importJWK(privateJwk, "EdDSA") : null;

const signedHeaders = async (path, method = "GET", claimOverrides = {}, issuedAt, expiresAt) => {
  if (!privateKey) throw new Error("A staging private JWK is required for authenticated checks.");
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    scope: "household:read",
    htm: method,
    htu: `${baseUrl}${path}`,
    ...claimOverrides,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: privateJwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("life-mcp")
    .setJti(crypto.randomUUID())
    .setIssuedAt(issuedAt ?? now)
    .setExpirationTime(expiresAt ?? now + 60)
    .sign(privateKey);
  return { authorization: `Bearer ${token}` };
};

const request = async (path, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(`${baseUrl}${path}`, { redirect: "manual", ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const authenticatedRequest = async (path, init = {}) => {
  const method = init.method ?? "GET";
  return request(path, { ...init, headers: { ...init.headers, ...await signedHeaders(path, method) } });
};

const check = (condition, label) => {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`PASS: ${label}`);
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isMetadata = (payload) =>
  payload.currency === "JPY" &&
  payload.timeZone === "Asia/Tokyo" &&
  typeof payload.generatedAt === "string" &&
  typeof payload.dataUpdatedAt === "string" &&
  typeof payload.calculationVersion === "string";

const verifyNoStore = (response, label) => {
  check(response.headers.get("cache-control")?.toLowerCase().includes("no-store"), `${label} disables caching`);
};

const verifyClosed = async () => {
  const response = await request(`/api/integrations/summary?month=${encodeURIComponent(month)}`);
  check(response.status === 503, "unconfigured integration remains closed");
  verifyNoStore(response, "closed response");
};

const verifyRejected = async () => {
  const response = await request(`/api/integrations/summary?month=${encodeURIComponent(month)}`);
  check(response.status === 401, "request without a signed JWT is rejected");
};

const verifyRevoked = async () => {
  if (!privateKey) throw new Error("Revocation check requires the retired private JWK in process environment only.");
  const response = await authenticatedRequest(`/api/integrations/summary?month=${encodeURIComponent(month)}`);
  check(response.status === 401, "JWT signed by a removed key is rejected");
};

const readJsonWithoutLogging = async (response, label) => {
  check(response.status === 200, `${label} returns 200`);
  verifyNoStore(response, label);
  const value = await response.json();
  check(isObject(value), `${label} returns a JSON object`);
  return value;
};

const verifyConnected = async () => {
  if (!privateKey) throw new Error("Connected check requires the staging private JWK in process environment.");
  await verifyRejected();

  const summaryPath = `/api/integrations/summary?month=${encodeURIComponent(month)}`;
  const wrongScope = await request(summaryPath, { headers: await signedHeaders(summaryPath, "GET", { scope: "other:read" }) });
  check(wrongScope.status === 401, "JWT without household read scope is rejected");
  const now = Math.floor(Date.now() / 1000);
  const expired = await request(summaryPath, { headers: await signedHeaders(summaryPath, "GET", {}, now - 120, now - 60) });
  check(expired.status === 401, "expired JWT is rejected");
  const wrongTarget = await request(`/api/integrations/balances?asOf=${encodeURIComponent(asOf)}`, {
    headers: await signedHeaders(summaryPath),
  });
  check(wrongTarget.status === 401, "JWT bound to another URL is rejected");

  const summaryResponse = await authenticatedRequest(summaryPath);
  const summary = await readJsonWithoutLogging(summaryResponse, "summary");
  check(isMetadata(summary), "summary metadata matches the contract");
  check(isObject(summary.period) && summary.period.month === month, "summary period matches the request");
  check(Number.isInteger(summary.income) && Number.isInteger(summary.expense) && Number.isInteger(summary.net), "summary amounts are integer yen");

  const balancesResponse = await authenticatedRequest(`/api/integrations/balances?asOf=${encodeURIComponent(asOf)}`);
  const balances = await readJsonWithoutLogging(balancesResponse, "balances");
  check(isMetadata(balances), "balances metadata matches the contract");
  check(balances.asOf === asOf && typeof balances.breakdownAvailable === "boolean", "balances basis matches the request");
  check(Number.isInteger(balances.totalAssets) && Array.isArray(balances.accounts), "balances shape matches the contract");

  for (const type of ["expense", "income"]) {
    const categoriesResponse = await authenticatedRequest(
      `/api/integrations/categories?month=${encodeURIComponent(month)}&type=${type}`,
    );
    const categories = await readJsonWithoutLogging(categoriesResponse, `${type} categories`);
    check(isMetadata(categories), `${type} categories metadata matches the contract`);
    check(
      categories.period?.month === month && categories.inclusion?.transactionType === type,
      `${type} categories basis matches the request`,
    );
    check(Number.isInteger(categories.total) && Array.isArray(categories.categories), `${type} categories shape matches the contract`);
    check(
      categories.categories.every((category) =>
        typeof category.name === "string" &&
        Number.isInteger(category.total) &&
        Number.isInteger(category.transactionCount) &&
        Array.isArray(category.transactions)
      ),
      `${type} category entries match the contract`,
    );
  }

  const badMonth = await authenticatedRequest("/api/integrations/summary?month=2026-13");
  check(badMonth.status === 400, "invalid month is rejected");
  verifyNoStore(badMonth, "invalid month response");

  const badDate = await authenticatedRequest("/api/integrations/balances?asOf=2026-02-30");
  check(badDate.status === 400, "invalid date is rejected");
  verifyNoStore(badDate, "invalid date response");

  const badType = await authenticatedRequest(`/api/integrations/categories?month=${encodeURIComponent(month)}&type=move`);
  check(badType.status === 400, "invalid transaction type is rejected");
  verifyNoStore(badType, "invalid transaction type response");

  const wrongMethod = await authenticatedRequest(`/api/integrations/summary?month=${encodeURIComponent(month)}`, { method: "POST" });
  check(wrongMethod.status === 405, "write method is rejected");

  if (process.env.HOUSEHOLD_TEST_RATE_LIMIT === "1") {
    let limited;
    for (let index = 0; index < 31; index += 1) {
      const response = await authenticatedRequest(`/api/integrations/summary?month=${encodeURIComponent(month)}`);
      if (response.status === 429) { limited = response; break; }
    }
    check(limited?.status === 429, "rate limit rejects excess requests");
    check(limited?.headers.get("retry-after") === "60", "rate limit returns Retry-After");
  } else {
    console.log("SKIP: rate limit check (set HOUSEHOLD_TEST_RATE_LIMIT=1 to run)");
  }
};

if (mode === "unavailable") await verifyClosed();
else if (mode === "connected") await verifyConnected();
else if (mode === "revoked") await verifyRevoked();
else throw new Error("Mode must be unavailable, connected, or revoked.");
