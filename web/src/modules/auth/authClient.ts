export type ChartRole =
  | "u1_health_lead"
  | "u2_cross_sector_lead"
  | "u3_district_health_officer"
  | "u4_district_cross_sector_officer"
  | "u5_public_visitor"
  | "chart_admin";

export type GeographyLevel = "country" | "geo_level_1" | "geo_level_2" | "geo_level_3";

export type CurrentUserContext = {
  userId: string;
  username: string;
  email?: string;
  roles: ChartRole[];
  geographyScopes: string[];
  activeGeographyId?: string;
  geographyLevel?: GeographyLevel;
};

export type AuthSession = {
  user: CurrentUserContext;
  accessToken?: string;
  refreshToken?: string;
  mode: "demo" | "keycloak";
};

const authStorageKey = "chart.auth.session";
const pkceStorageKey = "chart.auth.pkce";

export function getConfiguredAuthMode() {
  return process.env.NEXT_PUBLIC_CHART_AUTH_MODE === "keycloak" ? "keycloak" : "demo";
}

export function getStoredAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(authStorageKey);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

export function storeAuthSession(session: AuthSession) {
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(authStorageKey);
}

export async function signInWithDemoApi() {
  const user = await fetchCurrentUser();
  const session: AuthSession = { user, mode: "demo" };

  storeAuthSession(session);

  return session;
}

export async function startKeycloakSignIn() {
  const verifier = createRandomString();
  const challenge = await createCodeChallenge(verifier);
  const state = createRandomString();

  window.sessionStorage.setItem(pkceStorageKey, JSON.stringify({ verifier, state }));
  window.location.assign(buildKeycloakAuthorizeUrl(challenge, state));
}

export async function completeKeycloakSignIn(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  const savedPkce = readSavedPkce();

  if (!code || !state || !savedPkce || savedPkce.state !== state) {
    throw new Error("The sign-in response could not be verified.");
  }

  const tokenResponse = await fetch(buildKeycloakTokenUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getKeycloakClientId(),
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: savedPkce.verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Keycloak did not return a valid token.");
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!tokens.access_token) {
    throw new Error("Keycloak response is missing an access token.");
  }

  const user = await fetchCurrentUser(tokens.access_token);
  const session: AuthSession = {
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    mode: "keycloak",
  };

  storeAuthSession(session);
  window.sessionStorage.removeItem(pkceStorageKey);

  return session;
}

async function fetchCurrentUser(accessToken?: string) {
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: accessToken
      ? {
          authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error("The API could not resolve the current CHART user.");
  }

  return (await response.json()) as CurrentUserContext;
}

function readSavedPkce(): { verifier: string; state: string } | null {
  const rawPkce = window.sessionStorage.getItem(pkceStorageKey);

  if (!rawPkce) {
    return null;
  }

  try {
    return JSON.parse(rawPkce) as { verifier: string; state: string };
  } catch {
    window.sessionStorage.removeItem(pkceStorageKey);
    return null;
  }
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_CHART_API_URL ?? "http://127.0.0.1:3200";
}

function getKeycloakBaseUrl() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://127.0.0.1:8080";
}

function getKeycloakRealm() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "chart";
}

function getKeycloakClientId() {
  return process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "chart-web";
}

function getRedirectUri() {
  return `${window.location.origin}/auth/callback`;
}

function buildKeycloakAuthorizeUrl(challenge: string, state: string) {
  const url = new URL(
    `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`,
  );

  url.search = new URLSearchParams({
    client_id: getKeycloakClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  return url.toString();
}

function buildKeycloakTokenUrl() {
  return `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/token`;
}

function createRandomString() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);

  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array) {
  const text = String.fromCharCode(...bytes);

  return window.btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
