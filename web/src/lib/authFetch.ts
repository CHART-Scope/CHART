import {
  getCurrentAccessToken,
  getFreshAccessToken,
  renewAfterUnauthorized,
} from "./authClient";

export const DEFAULT_TIMEOUT_MS = 30_000;

export type AuthFetchInit = RequestInit & {
  /** Abort the attempt after this long. Each retry gets its own budget. */
  timeoutMs?: number;
  /**
   * Fallback when this tab holds no session (e.g. Storybook). The session's
   * own token always wins: a caller's copy may predate a rotation.
   */
  accessToken?: string | null;
  /** `false` for public reads that never carried a token. */
  auth?: boolean;
};

/**
 * `fetch` for CHART's same-origin API.
 *
 * Attaches the current access token (renewing it first when it is about to
 * expire), applies a default timeout merged with the caller's signal, and on
 * a 401 renews once - one shared refresh however many requests failed - and
 * retries the request a single time. The final response is returned as is;
 * callers keep their own error mapping.
 */
export async function authFetch(input: string, init: AuthFetchInit = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    accessToken: fallbackToken,
    auth = true,
    signal,
    headers,
    ...rest
  } = init;

  const send = (token: string | null) => {
    const merged = new Headers(headers);
    if (token) merged.set("authorization", `Bearer ${token}`);
    return fetch(input, {
      cache: "no-store",
      ...rest,
      headers: merged,
      signal: withTimeout(signal, timeoutMs),
    });
  };

  if (!auth) return send(null);

  const token =
    (getCurrentAccessToken() ? await getFreshAccessToken() : null) ??
    fallbackToken ??
    null;
  const response = await send(token);
  if (response.status !== 401 || !token || signal?.aborted) return response;

  const renewed = await renewAfterUnauthorized(token);
  return renewed ? send(renewed) : response;
}

export function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** The `error` code of a JSON error body, or null. */
export async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
