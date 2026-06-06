import {
  createPublicKey,
  type JsonWebKey,
  verify as verifySignature,
} from "node:crypto";

import {
  chartRoles,
  geographyLevels,
  type AuthConfig,
  type AuthErrorCode,
  type AuthRequestInput,
  type ChartRole,
  type CurrentUserContext,
  type GeographyLevel,
  type KeycloakTokenClaims,
} from "./types.js";

type JwksKey = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type JwksResponse = {
  keys?: JwksKey[];
};

type JwtHeader = {
  alg?: string;
  kid?: string;
};

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

const localKeycloakIssuerUrl = "http://127.0.0.1:8080/realms/chart";

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const issuerUrl = env.KEYCLOAK_ISSUER_URL ?? localKeycloakIssuerUrl;

  return {
    issuerUrl,
    clientId: env.KEYCLOAK_CLIENT_ID ?? "chart-api",
    jwksUrl: env.KEYCLOAK_JWKS_URL ?? `${issuerUrl}/protocol/openid-connect/certs`,
    clockSkewSeconds: Number(env.KEYCLOAK_CLOCK_SKEW_SECONDS ?? 30),
  };
}

export async function getCurrentUserContext(
  input: AuthRequestInput = {},
  config = getAuthConfig(),
): Promise<CurrentUserContext> {
  const token = readBearerToken(input.authorization);
  const claims = await verifyKeycloakToken(token, config);
  const context = mapKeycloakClaimsToCurrentUserContext(claims, config.clientId);

  return applyActiveGeography(context, input.activeGeographyId);
}

export async function getGeographyAccessResult(
  geographyPath: string | undefined,
  input: AuthRequestInput = {},
  config = getAuthConfig(),
) {
  if (!geographyPath) {
    throw new AuthError("GEOGRAPHY_QUERY_REQUIRED", 400);
  }

  const context = await getCurrentUserContext(input, config);

  if (!canReadGeographyPath(context, geographyPath)) {
    throw new AuthError("GEOGRAPHY_OUT_OF_SCOPE", 403);
  }

  return {
    canAccess: true,
    geographyPath: normalizeGeographyPath(geographyPath),
    userId: context.userId,
  };
}

export function mapKeycloakClaimsToCurrentUserContext(
  claims: KeycloakTokenClaims,
  clientId: string,
): CurrentUserContext {
  if (!claims.sub) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Token is missing subject.");
  }

  const roles = collectChartRoles(claims, clientId);
  const geographyScopes = collectGeographyScopes(claims);

  return {
    userId: claims.sub,
    username: claims.preferred_username ?? claims.email ?? claims.sub,
    email: claims.email,
    roles,
    geographyScopes,
    activeGeographyId: geographyScopes[0],
    geographyLevel: inferGeographyLevel(geographyScopes[0]),
  };
}

export function canReadGeographyPath(
  context: CurrentUserContext,
  requestedPath: string,
): boolean {
  const normalizedRequest = normalizeGeographyPath(requestedPath);

  return context.geographyScopes.some((scope) => {
    const normalizedScope = normalizeGeographyPath(scope);

    return (
      normalizedRequest === normalizedScope ||
      normalizedRequest.startsWith(`${normalizedScope}/`) ||
      normalizedScope.startsWith(`${normalizedRequest}/`)
    );
  });
}

export function canSelectActiveGeography(
  context: CurrentUserContext,
  activeGeographyId: string,
): boolean {
  return canReadGeographyPath(context, activeGeographyId);
}

function applyActiveGeography(
  context: CurrentUserContext,
  activeGeographyId?: string,
): CurrentUserContext {
  if (!activeGeographyId) {
    return context;
  }

  if (!canSelectActiveGeography(context, activeGeographyId)) {
    throw new AuthError("ACTIVE_GEOGRAPHY_OUT_OF_SCOPE", 403);
  }

  const normalizedActiveGeography = normalizeGeographyPath(activeGeographyId);

  return {
    ...context,
    activeGeographyId: normalizedActiveGeography,
    geographyLevel: inferGeographyLevel(normalizedActiveGeography),
  };
}

function collectChartRoles(claims: KeycloakTokenClaims, clientId: string): ChartRole[] {
  const tokenRoles = new Set<string>();
  const realmRoles = toStringArray(claims.realm_access?.roles);
  const clientRoles = toStringArray(claims.resource_access?.[clientId]?.roles);

  for (const role of [...realmRoles, ...clientRoles]) {
    tokenRoles.add(role);
  }

  return chartRoles.filter((role) => tokenRoles.has(role));
}

function collectGeographyScopes(claims: KeycloakTokenClaims): string[] {
  const groups = toStringArray(claims.groups)
    .map((group) => normalizeGeographyPath(group))
    .filter((group) => group !== "/");

  return [...new Set(groups)];
}

function inferGeographyLevel(scope: string | undefined): GeographyLevel | undefined {
  if (!scope) {
    return undefined;
  }

  const depth = normalizeGeographyPath(scope).split("/").filter(Boolean).length;
  const level = geographyLevels[Math.min(depth - 1, geographyLevels.length - 1)];

  return level;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readBearerToken(authorization?: string): string {
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("AUTH_TOKEN_REQUIRED", 401);
  }

  return token;
}

async function verifyKeycloakToken(
  token: string,
  config: AuthConfig,
): Promise<KeycloakTokenClaims> {
  const issuerUrl = config.issuerUrl?.replace(/\/$/, "");

  if (!issuerUrl) {
    throw new AuthError("AUTH_CONFIG_INVALID", 500, "Missing KEYCLOAK_ISSUER_URL.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401);
  }

  const header = decodeJwtPart<JwtHeader>(encodedHeader);
  const claims = decodeJwtPart<KeycloakTokenClaims>(encodedPayload);

  if (header.alg !== "RS256") {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Only RS256 tokens are accepted.");
  }

  await verifyJwtSignature(token, header, config, issuerUrl);
  validateTokenClaims(claims, config, issuerUrl);

  return claims;
}

async function verifyJwtSignature(
  token: string,
  header: JwtHeader,
  config: AuthConfig,
  issuerUrl: string,
) {
  const key = await findJwksKey(header, config, issuerUrl);
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  const publicKey = createPublicKey({ key: key as JsonWebKey, format: "jwk" });
  const signature = base64UrlDecode(encodedSignature);
  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const isValid = verifySignature("RSA-SHA256", signingInput, publicKey, signature);

  if (!isValid) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401);
  }
}

async function findJwksKey(
  header: JwtHeader,
  config: AuthConfig,
  issuerUrl: string,
): Promise<JwksKey> {
  const jwksUrl = config.jwksUrl ?? `${issuerUrl}/protocol/openid-connect/certs`;
  const response = await fetch(jwksUrl);

  if (!response.ok) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Could not read Keycloak JWKS.");
  }

  const jwks = (await response.json()) as JwksResponse;
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid);

  if (!key) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Token signing key not found.");
  }

  return key;
}

function validateTokenClaims(
  claims: KeycloakTokenClaims,
  config: AuthConfig,
  issuerUrl: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const skew = config.clockSkewSeconds;

  if (claims.iss !== issuerUrl) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Token issuer does not match.");
  }

  if (claims.exp !== undefined && claims.exp + skew < now) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Token has expired.");
  }

  if (claims.nbf !== undefined && claims.nbf - skew > now) {
    throw new AuthError("AUTH_TOKEN_INVALID", 401, "Token is not active yet.");
  }
}

function decodeJwtPart<T>(encodedPart: string): T {
  try {
    return JSON.parse(base64UrlDecode(encodedPart).toString("utf8")) as T;
  } catch {
    throw new AuthError("AUTH_TOKEN_INVALID", 401);
  }
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function normalizeGeographyPath(path: string): string {
  const normalized = path.trim().replace(/\/+/g, "/");

  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }

  return normalized.replace(/\/$/, "") || "/";
}
