import { recordAuditEvent } from "@/lib/audit";

export type CurrentUser = {
  userId: string;
  username: string;
  roles: string[];
  geographyScopes: string[];
  activeGeographyId?: string;
};

export type AuthSession = {
  user: CurrentUser;
  accessToken: string;
};

type TokenResponse = {
  access_token?: string;
};

let currentSession: AuthSession | null = null;

export function getStoredAuthSession() {
  return currentSession;
}

export async function restoreAuthSession() {
  return refreshAuthSession();
}

export async function ensureFreshAuthSession(session: AuthSession) {
  if (!shouldRefresh(session.accessToken)) return session;
  return refreshAuthSession();
}

export async function completeKeycloakSignIn(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) throw new Error("The sign-in response could not be verified.");

  const response = await fetch("/api/auth/keycloak-exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("CHART sign-in did not return a valid token.");
  return storeTokenSession((await response.json()) as TokenResponse);
}

export function startKeycloakSignIn() {
  window.location.replace("/auth/signin");
}

export function signOutOfKeycloak() {
  recordAuditEvent({ event_type: "signout" });
  currentSession = null;
  window.location.assign("/auth/signout?returnTo=/plan");
}

export function signedInHomePath(user: CurrentUser) {
  return user.roles.length > 0 && user.geographyScopes.length > 0
    ? "/plan"
    : "/access-pending";
}

export function refreshDelay(accessToken: string) {
  try {
    const encoded = accessToken.split(".")[1];
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as { exp?: number };
    return payload.exp ? Math.max(0, payload.exp * 1000 - Date.now() - 30_000) : null;
  } catch {
    return null;
  }
}

async function refreshAuthSession() {
  const response = await fetch("/api/auth/keycloak-refresh", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("The CHART session could not be renewed.");
  return storeTokenSession((await response.json()) as TokenResponse);
}

async function storeTokenSession(tokens: TokenResponse) {
  if (!tokens.access_token) throw new Error("The access token is missing.");
  const user = await fetchCurrentUser(tokens.access_token);
  const previous = currentSession;
  const session: AuthSession = {
    user,
    accessToken: tokens.access_token,
  };
  currentSession = session;
  // Only fire signin when the user *becomes* logged in — refreshes rotate
  // the token but keep the same identity, so they should not spam signin.
  if (!previous || previous.user.userId !== user.userId) {
    recordAuditEvent({
      event_type: "signin",
      payload: { username: user.username, roles: user.roles },
    });
  }
  return session;
}

async function fetchCurrentUser(accessToken: string) {
  const response = await fetch("/api/chart/auth/me", {
    cache: "no-store",
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("The signed-in CHART user could not be loaded.");
  return (await response.json()) as CurrentUser;
}

function shouldRefresh(accessToken: string) {
  const delay = refreshDelay(accessToken);
  return delay !== null && delay === 0;
}
