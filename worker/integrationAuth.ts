import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

export type IntegrationAuthConfig = {
  jwks: string;
  issuer: string;
  audience: string;
};

const MAX_TOKEN_LIFETIME_SECONDS = 60;
const CLOCK_TOLERANCE_SECONDS = 5;
const REQUIRED_SUBJECT = "life-mcp";
const REQUIRED_SCOPE = "household:read";

const parsePublicJwks = (value: string) => {
  const parsed = JSON.parse(value) as Partial<JSONWebKeySet>;
  if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) throw new Error("invalid_jwks");
  for (const key of parsed.keys) {
    if (
      key.kty !== "OKP" ||
      key.crv !== "Ed25519" ||
      key.alg !== "EdDSA" ||
      key.use !== "sig" ||
      typeof key.kid !== "string" ||
      key.kid.length === 0 ||
      "d" in key
    ) throw new Error("invalid_jwks");
  }
  return parsed as JSONWebKeySet;
};

const requestTarget = (request: Request) => {
  const url = new URL(request.url);
  return `${url.origin}${url.pathname}${url.search}`;
};

export const authenticateIntegrationRequest = async (
  request: Request,
  config: IntegrationAuthConfig,
  now = Math.floor(Date.now() / 1000),
) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("missing_integration_token");
  const keySet = createLocalJWKSet(parsePublicJwks(config.jwks));
  const { payload, protectedHeader } = await jwtVerify(token, keySet, {
    algorithms: ["EdDSA"],
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    currentDate: new Date(now * 1000),
  });
  if (protectedHeader.typ !== "JWT" || !protectedHeader.kid) throw new Error("invalid_integration_header");
  if (payload.sub !== REQUIRED_SUBJECT) throw new Error("invalid_integration_subject");
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") throw new Error("invalid_integration_lifetime");
  if (payload.exp <= payload.iat || payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error("invalid_integration_lifetime");
  }
  if (payload.iat > now + CLOCK_TOLERANCE_SECONDS || now - payload.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error("invalid_integration_lifetime");
  }
  if (typeof payload.jti !== "string" || payload.jti.length < 16 || payload.jti.length > 128) {
    throw new Error("invalid_integration_jti");
  }
  const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
  if (!scopes.includes(REQUIRED_SCOPE)) throw new Error("invalid_integration_scope");
  if (payload.htm !== request.method || payload.htu !== requestTarget(request)) {
    throw new Error("integration_request_mismatch");
  }
  return { caller: `${config.issuer}:${payload.sub}`, tokenId: payload.jti };
};
