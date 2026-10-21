import { flushAuditNow, recordAuditEvent, resetAuditSession } from "@/lib/audit";
import { submitSignOut } from "@/lib/signOutRequest";

/**
 * The browser's CHART session.
 *
 * The access token lives only in this module's memory; the refresh and id
 * tokens are httpOnly cookies the Next routes read. One tab-wide runtime owns
 * renewal so callers never schedule their own timers:
 *
 * - Refresh is single-flight within a tab (one shared promise) and serialised
 *   across tabs with the Web Locks API; a refreshed token is shared with the
 *   other tabs over the `chart-auth` BroadcastChannel.
 * - A refresh that answers 401 means the session is over. A 503 or network
 *   failure is the identity provider being unavailable: the current token is
 *   kept and the refresh retried with backoff, and nothing redirects.
 * - `/auth/me` is read when a session starts (sign-in, restore, explicit
 *   re-check), not on every token rotation.
 * - Thirty minutes without pointer (including movement), key, scroll or
 *   visibility activity in any tab signs the user out with a message on the
 *   landing page. `IdleWarning` asks "Still there?" for the last two minutes.
 *
 * React subscribes through `subscribeAuthSession`. Listeners hear identity
 * changes and sign-outs only: a token rotation is invisible to the tree, so
 * nothing keyed on the session refetches every five minutes.
 */

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

export type SignOutReason = "user" | "idle" | "other_tab" | "expired" | "reset";

/** The refresh token is gone or rejected: the user has to sign in again. */
export class AuthSessionEndedError extends Error {
  constructor(code = "AUTH_SESSION_EXPIRED") {
    super(code);
    this.name = "AuthSessionEndedError";
  }
}

/** Keycloak or the API could not be reached; the session itself may be fine. */
export class AuthUnavailableError extends Error {
  constructor(code = "AUTH_PROVIDER_UNAVAILABLE") {
    super(code);
    this.name = "AuthUnavailableError";
  }
}

export function isAuthSessionEnded(error: unknown) {
  return error instanceof AuthSessionEndedError;
}

type TokenResponse = { access_token?: string };
type SessionListener = (session: AuthSession | null, reason?: SignOutReason) => void;
type ChannelMessage =
  | { type: "token"; userId: string; accessToken: string }
  | { type: "signout"; reason: SignOutReason };

export const IDLE_TIMEOUT_MS = 30 * 60_000;
const REFRESH_LEAD_MS = 30_000;
const NEAR_EXPIRY_MS = 60_000;
const IDLE_CHECK_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
const MAX_TIMER_MS = 2_147_483_647;
const activeGeographyStorageKey = "chart.activeGeography";
const lastActivityStorageKey = "chart.auth.lastActivity";
const signedOutReasonStorageKey = "chart.auth.signedOutReason";

let currentSession: AuthSession | null = null;
let refreshInFlight: Promise<AuthSession> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshRetryAttempt = 0;
let runtimeStarted = false;
let signingOut = false;
/** Bumped on every clear, so a refresh that outlives a sign-out is dropped. */
let sessionEpoch = 0;
let channel: BroadcastChannel | null = null;
let lastActivity = 0;
let lastActivityPersisted = 0;
const listeners = new Set<SessionListener>();
const clearHandlers = new Set<() => void>();

// --- Reading and subscribing ------------------------------------------------

export function getStoredAuthSession() {
  return currentSession;
}

/** The newest access token in this tab, or null when signed out. */
export function getCurrentAccessToken() {
  return currentSession?.accessToken ?? null;
}

/** Hear sign-in, identity changes and sign-out; not token rotations. */
export function subscribeAuthSession(listener: SessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Run when the session is cleared, to drop per-user caches. */
export function onAuthSessionCleared(handler: () => void) {
  clearHandlers.add(handler);
  return () => {
    clearHandlers.delete(handler);
  };
}

function notify(session: AuthSession | null, reason?: SignOutReason) {
  for (const listener of [...listeners]) listener(session, reason);
}

// --- Session lifecycle ------------------------------------------------------

export function clearStoredAuthSession(reason: SignOutReason = "reset") {
  const hadSession = currentSession !== null;
  currentSession = null;
  sessionEpoch += 1;
  refreshInFlight = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshRetryAttempt = 0;
  if (typeof window !== "undefined") {
    safeStorage(() => window.sessionStorage.removeItem(activeGeographyStorageKey));
  }
  // The pending audit queue belongs to the user who just left; the next user
  // must never post it with their own token.
  resetAuditSession();
  for (const handler of [...clearHandlers]) {
    try {
      handler();
    } catch {
      // A cache that fails to clear must not keep the session alive.
    }
  }
  if (hadSession) notify(null, reason);
}

export function rememberActiveGeography(path: string) {
  if (typeof window !== "undefined") {
    safeStorage(() => window.sessionStorage.setItem(activeGeographyStorageKey, path));
  }
  // Deliberately silent: a context switch is already reflected in the URL and
  // the component that made it; notifying would remount pages mid-selection.
  if (currentSession) {
    currentSession = {
      ...currentSession,
      user: { ...currentSession.user, activeGeographyId: path },
    };
  }
}

/** Re-read the session from the cookies and `/auth/me` (sign-in, re-check). */
export async function restoreAuthSession() {
  const hadSession = currentSession !== null;
  const session = await refreshAuthSession(currentSession?.accessToken ?? null);
  if (!hadSession) return session;
  return reloadCurrentUser(session.accessToken);
}

/**
 * The session with a token that is not about to expire. A transient refresh
 * failure keeps the session (the token may still be valid); only a session
 * that has ended throws. Returns `session` itself while the identity is
 * unchanged, so state holding it does not change on every rotation.
 */
export async function ensureFreshAuthSession(session: AuthSession) {
  const current = currentSession ?? session;
  let fresh = current;
  if (isNearExpiry(current.accessToken, REFRESH_LEAD_MS)) {
    try {
      fresh = await refreshAuthSession(current.accessToken);
    } catch (error) {
      if (error instanceof AuthSessionEndedError) throw error;
      return session;
    }
  }
  return sameIdentity(fresh.user, session.user) ? session : fresh;
}

/**
 * An access token that is valid right now, or null when signed out.
 *
 * For background work (audit flushes, polling) outside React. A hidden tab
 * throttles timers, so the stored token can already have expired when the
 * tab wakes; this refreshes it first. If the provider is unavailable the
 * current token is returned and the request may still succeed.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const stored = currentSession;
  if (!stored) return null;
  try {
    await ensureFreshAuthSession(stored);
  } catch {
    return null;
  }
  return currentSession?.accessToken ?? null;
}

/**
 * Renew after the API rejected `rejectedToken`. Resolves to the token to
 * retry with, or null when there is nothing better to send.
 */
export async function renewAfterUnauthorized(rejectedToken: string | null) {
  if (!currentSession) return null;
  try {
    return (await refreshAuthSession(rejectedToken)).accessToken;
  } catch {
    return null;
  }
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    // AUTH_CALLBACK_INVALID covers a consumed, expired or mismatched PKCE
    // cookie, so it does not prove this browser tab signed in.
    const failure = new Error("CHART sign-in did not return a valid token.");
    failure.name = await readAuthErrorCode(response);
    throw failure;
  }
  const tokens = (await response.json()) as TokenResponse;
  if (!tokens.access_token) throw new Error("The access token is missing.");
  return startSession(tokens.access_token);
}

export function startKeycloakSignIn() {
  window.location.replace("/auth/signin");
}

export function signOutOfKeycloak() {
  void signOut("user");
}

/** Why the last tab session ended, read once by the landing page. */
export function takeSignedOutReason(): SignOutReason | null {
  if (typeof window === "undefined") return null;
  const reason = safeStorage(() => {
    const stored = window.sessionStorage.getItem(signedOutReasonStorageKey);
    window.sessionStorage.removeItem(signedOutReasonStorageKey);
    return stored;
  });
  return (reason as SignOutReason | null) ?? null;
}

export function signedInHomePath(user: CurrentUser) {
  return user.roles.length > 0 && user.geographyScopes.length > 0
    ? "/plan"
    : "/access-pending";
}

/** Milliseconds until the token should be renewed (30 s before it expires). */
export function refreshDelay(accessToken: string) {
  const expiresAt = tokenExpiry(accessToken);
  return expiresAt === null
    ? null
    : Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_MS);
}

// --- Refresh ----------------------------------------------------------------

function refreshAuthSession(rejectedToken: string | null): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight;
  const refresh: Promise<AuthSession> = withRefreshLock(async () => {
    // Another tab may have refreshed while this one waited for the lock, and
    // shared the token over the channel.
    const current = currentSession;
    if (
      current &&
      current.accessToken !== rejectedToken &&
      !isNearExpiry(current.accessToken, REFRESH_LEAD_MS)
    ) {
      return current;
    }
    const epoch = sessionEpoch;
    let accessToken: string;
    try {
      accessToken = await requestTokenRefresh();
    } catch (error) {
      if (error instanceof AuthSessionEndedError && currentSession) {
        clearStoredAuthSession("expired");
      }
      throw error;
    }
    // Signed out while the refresh was out: never revive the session.
    if (epoch !== sessionEpoch || signingOut) {
      throw new AuthSessionEndedError("AUTH_SIGNED_OUT");
    }
    const signedIn = currentSession;
    const subject = tokenSubject(accessToken);
    if (signedIn && (subject === null || subject === signedIn.user.userId)) {
      const rotated = { ...signedIn, accessToken };
      currentSession = rotated;
      afterTokenChange(rotated, true);
      return rotated;
    }
    return startSession(accessToken);
  }).finally(() => {
    if (refreshInFlight === refresh) refreshInFlight = null;
  });
  refreshInFlight = refresh;
  return refresh;
}

async function requestTokenRefresh() {
  let response: Response;
  try {
    response = await fetch("/api/auth/keycloak-refresh", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AuthUnavailableError();
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new AuthSessionEndedError(await readAuthErrorCode(response));
  }
  if (!response.ok) throw new AuthUnavailableError(await readAuthErrorCode(response));
  const tokens = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!tokens.access_token) throw new AuthUnavailableError("AUTH_REFRESH_INVALID");
  return tokens.access_token;
}

async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return work();
  return locks.request("chart-auth-refresh", work) as Promise<T>;
}

/** A new session: read the user, record the sign-in, start the runtime. */
async function startSession(accessToken: string) {
  const user = await loadUserWithStoredGeography(accessToken);
  const previous = currentSession;
  const session: AuthSession = { user, accessToken };
  currentSession = session;
  // Only fire signin when the user *becomes* logged in.
  if (!previous || previous.user.userId !== user.userId) {
    recordAuditEvent({
      event_type: "signin",
      payload: { username: user.username, roles: user.roles },
    });
  }
  noteActivity(true);
  afterTokenChange(session, true);
  if (!previous || !sameIdentity(previous.user, user)) notify(session);
  return session;
}

async function reloadCurrentUser(accessToken: string) {
  const user = await loadUserWithStoredGeography(accessToken);
  const previous = currentSession;
  const session: AuthSession = {
    user,
    accessToken: currentSession?.accessToken ?? accessToken,
  };
  currentSession = session;
  if (!previous || !sameIdentity(previous.user, user)) notify(session);
  return session;
}

async function loadUserWithStoredGeography(accessToken: string) {
  const activeGeography =
    typeof window === "undefined"
      ? null
      : safeStorage(() => window.sessionStorage.getItem(activeGeographyStorageKey));
  try {
    return await fetchCurrentUser(accessToken, activeGeography ?? null);
  } catch (error) {
    if (!activeGeography || error instanceof AuthUnavailableError) throw error;
    safeStorage(() => window.sessionStorage.removeItem(activeGeographyStorageKey));
    return fetchCurrentUser(accessToken);
  }
}

async function fetchCurrentUser(accessToken: string, activeGeography?: string | null) {
  let response: Response;
  try {
    response = await fetch("/api/chart/auth/me", {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(activeGeography ? { "x-chart-active-geography": activeGeography } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AuthUnavailableError("CHART_API_UNAVAILABLE");
  }
  if (response.status === 401) throw new AuthSessionEndedError("AUTH_TOKEN_INVALID");
  if (response.status >= 500) throw new AuthUnavailableError("CHART_API_UNAVAILABLE");
  if (!response.ok) throw new Error("The signed-in CHART user could not be loaded.");
  return (await response.json()) as CurrentUser;
}

function afterTokenChange(session: AuthSession, broadcast: boolean) {
  refreshRetryAttempt = 0;
  startSessionRuntime();
  scheduleRefresh();
  if (broadcast) {
    postToTabs({
      type: "token",
      userId: session.user.userId,
      accessToken: session.accessToken,
    });
  }
}

function scheduleRefresh(delayOverride?: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!currentSession || typeof window === "undefined") return;
  const delay = delayOverride ?? refreshDelay(currentSession.accessToken);
  if (delay === null) return;
  refreshTimer = setTimeout(
    () => void backgroundRefresh(),
    Math.min(delay, MAX_TIMER_MS),
  );
}

async function backgroundRefresh() {
  const session = currentSession;
  if (!session) return;
  if (isIdle()) {
    void signOut("idle");
    return;
  }
  try {
    await refreshAuthSession(session.accessToken);
  } catch (error) {
    if (error instanceof AuthSessionEndedError) return;
    const delay =
      RETRY_DELAYS_MS[Math.min(refreshRetryAttempt, RETRY_DELAYS_MS.length - 1)];
    refreshRetryAttempt += 1;
    scheduleRefresh(delay);
  }
}

// --- Tab runtime: activity, idle timeout, wake-up, other tabs ---------------

function startSessionRuntime() {
  if (runtimeStarted || typeof window === "undefined") return;
  runtimeStarted = true;
  const onActivity = () => noteActivity();
  // Moving the pointer counts: someone reading a dashboard is still there.
  for (const event of [
    "pointermove",
    "pointerdown",
    "keydown",
    "scroll",
    "wheel",
    "touchstart",
  ]) {
    window.addEventListener(event, onActivity, { passive: true, capture: true });
  }
  const onWake = () => {
    if (document.visibilityState !== "visible" || !currentSession) return;
    // Judge the absence before counting the return as activity.
    if (isIdle()) {
      void signOut("idle");
      return;
    }
    noteActivity();
    if (isNearExpiry(currentSession.accessToken, NEAR_EXPIRY_MS))
      void backgroundRefresh();
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  setInterval(() => {
    if (currentSession && isIdle()) void signOut("idle");
  }, IDLE_CHECK_MS);
  openChannel();
}

/** Milliseconds before an idle sign-out, or null when signed out. */
export function msUntilIdleSignOut(): number | null {
  if (!currentSession || typeof window === "undefined") return null;
  return Math.max(0, latestActivity() + IDLE_TIMEOUT_MS - Date.now());
}

/** Restart the idle count, as any activity does ("Stay signed in"). */
export function keepSessionActive() {
  noteActivity(true);
}

function noteActivity(force = false) {
  const now = Date.now();
  lastActivity = now;
  if (!force && now - lastActivityPersisted < 5_000) return;
  lastActivityPersisted = now;
  safeStorage(() => window.localStorage.setItem(lastActivityStorageKey, String(now)));
}

function isIdle() {
  const latest = latestActivity();
  return latest > 0 && Date.now() - latest >= IDLE_TIMEOUT_MS;
}

function latestActivity() {
  // Activity in any tab keeps every tab's session: the cookies are shared,
  // so one idle tab signing out would end the busy one too.
  const shared = Number(
    safeStorage(() => window.localStorage.getItem(lastActivityStorageKey)) ?? 0,
  );
  return Math.max(lastActivity, Number.isFinite(shared) ? shared : 0);
}

function openChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("chart-auth");
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data;
    if (message?.type === "token") adoptSharedToken(message);
    if (message?.type === "signout") {
      void finishSignOut(message.reason === "idle" ? "idle" : "other_tab", "/", false);
    }
  };
}

function postToTabs(message: ChannelMessage) {
  try {
    channel?.postMessage(message);
  } catch {
    // A closed channel only costs the other tabs a refresh of their own.
  }
}

function adoptSharedToken(message: { userId: string; accessToken: string }) {
  const session = currentSession;
  if (!session || session.user.userId !== message.userId) return;
  if (session.accessToken === message.accessToken) return;
  const incoming = tokenExpiry(message.accessToken) ?? 0;
  const held = tokenExpiry(session.accessToken) ?? 0;
  if (incoming < held) return;
  currentSession = { ...session, accessToken: message.accessToken };
  afterTokenChange(currentSession, false);
}

// --- Sign-out ---------------------------------------------------------------

async function signOut(reason: SignOutReason) {
  await finishSignOut(reason, reason === "user" ? "/plan" : "/", true);
}

async function finishSignOut(
  reason: SignOutReason,
  returnTo: string,
  endProviderSession: boolean,
) {
  if (signingOut || (!currentSession && !endProviderSession)) return;
  signingOut = true;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (endProviderSession) {
    recordAuditEvent({
      event_type: "signout",
      ...(reason === "user" ? {} : { payload: { reason } }),
    });
  }
  // Send this user's events with this user's token before it is dropped.
  await Promise.race([
    flushAuditNow(() => currentSession?.accessToken ?? null).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (endProviderSession) postToTabs({ type: "signout", reason });
  clearStoredAuthSession(reason);
  if (reason === "idle" || reason === "other_tab") {
    safeStorage(() => window.sessionStorage.setItem(signedOutReasonStorageKey, reason));
  }
  if (endProviderSession) {
    submitSignOut(returnTo);
  } else {
    window.location.assign(returnTo);
  }
}

// --- Helpers ----------------------------------------------------------------

function sameIdentity(left: CurrentUser, right: CurrentUser) {
  return (
    left.userId === right.userId &&
    left.roles.join("|") === right.roles.join("|") &&
    left.geographyScopes.join("|") === right.geographyScopes.join("|")
  );
}

function isNearExpiry(accessToken: string, leadMs: number) {
  const expiresAt = tokenExpiry(accessToken);
  return expiresAt !== null && expiresAt - Date.now() <= leadMs;
}

function tokenExpiry(accessToken: string) {
  const exp = tokenClaims(accessToken)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

function tokenSubject(accessToken: string) {
  const sub = tokenClaims(accessToken)?.sub;
  return typeof sub === "string" ? sub : null;
}

function tokenClaims(accessToken: string): { exp?: unknown; sub?: unknown } | null {
  try {
    const encoded = accessToken.split(".")[1];
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as { exp?: unknown; sub?: unknown };
  } catch {
    return null;
  }
}

async function readAuthErrorCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "AUTH_EXCHANGE_FAILED";
  } catch {
    return "AUTH_EXCHANGE_FAILED";
  }
}

function safeStorage<T>(action: () => T): T | null {
  try {
    return action();
  } catch {
    return null;
  }
}
