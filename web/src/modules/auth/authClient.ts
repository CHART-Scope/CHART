export type ChartRole =
  | "chart_admin"
  | "content_editor"
  | "health_planning_lead"
  | "cross_sector_planning_lead"
  | "health_implementation_officer"
  | "cross_sector_implementation_officer"
  | "public_viewer";

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

export type AuthTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
};

const authStorageKey = "chart.auth.session";
const legacyPkceStorageKey = "chart.auth.pkce";

export function getStoredAuthSession(): AuthSession | null {
  const storage = getBrowserStorage("localStorage");

  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(authStorageKey);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    storage.removeItem(authStorageKey);
    return null;
  }
}

export function storeAuthSession(session: AuthSession) {
  const storage = getBrowserStorage("localStorage");

  if (!storage) {
    throw new Error("Browser storage is not available for CHART sign-in.");
  }

  storage.setItem(authStorageKey, JSON.stringify(session));
}

export function clearAuthSession() {
  getBrowserStorage("localStorage")?.removeItem(authStorageKey);
  getBrowserStorage("localStorage")?.removeItem(legacyPkceStorageKey);
  getBrowserStorage("sessionStorage")?.removeItem(legacyPkceStorageKey);
}

export function startKeycloakSignIn() {
  clearAuthSession();
  window.location.replace("/auth/signin");
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

  const tokens = (await tokenResponse.json()) as AuthTokenResponse;

  return storeTokenSession(tokens);
}

export async function storeTokenSession(tokens: AuthTokenResponse) {
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

export function signOutOfKeycloak(returnTo = "/") {
  clearAuthSession();
  window.location.assign(`/auth/signout?returnTo=${encodeURIComponent(returnTo)}`);
}

async function fetchCurrentUser(accessToken?: string) {
  const response = await fetch("/api/chart/auth/me", {
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

function getBrowserStorage(kind: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}
