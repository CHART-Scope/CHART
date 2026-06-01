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
  idToken?: string;
  refreshToken?: string;
};

const authStorageKey = "chart.auth.session";
const legacyPkceStorageKey = "chart.auth.pkce";

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
  window.localStorage.removeItem(legacyPkceStorageKey);
  window.sessionStorage.removeItem(legacyPkceStorageKey);
}

export async function startKeycloakSignIn() {
  clearAuthSession();
  window.location.assign("/auth/signin");
}

export async function completeKeycloakSignIn(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) {
    throw new Error("The sign-in response could not be verified.");
  }

  const tokenResponse = await fetch("/api/auth/keycloak-exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ code, state }),
  });

  if (!tokenResponse.ok) {
    throw new Error("CHART sign-in did not return a valid token.");
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
  };

  if (!tokens.access_token) {
    throw new Error("CHART sign-in response is missing an access token.");
  }

  const user = await fetchCurrentUser(tokens.access_token);
  const session: AuthSession = {
    user,
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
  };

  storeAuthSession(session);
  window.localStorage.removeItem(legacyPkceStorageKey);

  return session;
}

export function signOutOfKeycloak() {
  const session = getStoredAuthSession();
  const logoutUrl = buildKeycloakLogoutUrl(session?.idToken);

  clearAuthSession();
  window.location.assign(logoutUrl);
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
    throw new Error(
      `The API could not resolve the current CHART user: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as CurrentUserContext;
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

function buildKeycloakLogoutUrl(idToken?: string) {
  const url = new URL(
    `${getKeycloakBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/logout`,
  );

  const params = new URLSearchParams({
    client_id: getKeycloakClientId(),
    post_logout_redirect_uri: `${window.location.origin}/`,
  });

  if (idToken) {
    params.set("id_token_hint", idToken);
  }

  url.search = params.toString();

  return url.toString();
}
