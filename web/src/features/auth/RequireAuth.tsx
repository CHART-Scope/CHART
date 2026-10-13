"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  ensureFreshAuthSession,
  getStoredAuthSession,
  isAuthSessionEnded,
  restoreAuthSession,
  startKeycloakSignIn,
  subscribeAuthSession,
  type AuthSession,
} from "@/lib/authClient";

/** Retry delays while the identity provider or API is unreachable. */
const UNAVAILABLE_RETRY_MS = [2_000, 5_000, 15_000, 30_000];
import styles from "./AuthState.module.css";

export function RequireAuth({
  children,
  fallback,
}: {
  children: (session: AuthSession) => ReactNode;
  /** Shown while the session is being restored. Pass a skeleton of the page
   * that is coming; without one a generic card is used. */
  fallback?: ReactNode;
}) {
  // Seeded from the in-memory session, so a mount during client-side
  // navigation renders its children on the first frame instead of flashing
  // the fallback for a session it already has. Only a hard load starts empty.
  const [session, setSession] = useState<AuthSession | null>(getStoredAuthSession);
  const [unavailable, setUnavailable] = useState(false);
  const redirected = useRef(false);

  // authClient owns renewal. This component only restores the session once
  // and then listens: listeners hear identity changes and sign-outs, never a
  // token rotation, so the tree below does not re-render every few minutes.
  // Only a session that has really ended goes to sign-in; an unreachable
  // provider or API keeps retrying here instead.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeAuthSession((next, reason) => {
      if (cancelled) return;
      if (next) setSession(next);
      else if (reason === "expired") redirect();
    });
    const load = () => {
      const stored = getStoredAuthSession();
      (stored ? ensureFreshAuthSession(stored) : restoreAuthSession())
        .then((fresh) => {
          if (cancelled) return;
          setUnavailable(false);
          setSession(fresh);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (isAuthSessionEnded(error)) return redirect();
          setUnavailable(true);
          const delay =
            UNAVAILABLE_RETRY_MS[Math.min(attempt, UNAVAILABLE_RETRY_MS.length - 1)];
          attempt += 1;
          retryTimer = setTimeout(load, delay);
        });
    };
    load();
    return () => {
      cancelled = true;
      unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  function redirect() {
    if (redirected.current) return;
    redirected.current = true;
    startKeycloakSignIn();
  }

  if (!session) {
    // Two different waits, and they used to look the same. Restoring a
    // session is the common case, takes a fraction of a second, and is not a
    // sign-in - announcing "Opening sign in" on every page load told users
    // something untrue and made a fast path feel like an interruption. A
    // caller that knows its own layout passes a skeleton of it instead; the
    // card below is kept for the moment a redirect really is under way.
    if (unavailable) {
      return (
        <main className={styles.page}>
          <section className={styles.card} role="status">
            <span>CHART secure workspace</span>
            <h1>CHART is temporarily unavailable</h1>
            <p>Your session is kept. Reconnecting automatically…</p>
          </section>
        </main>
      );
    }
    if (fallback) return <>{fallback}</>;
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span>CHART secure workspace</span>
          <h1>{redirected.current ? "Opening sign in" : "Loading"}</h1>
          <p>Checking your role and planning area.</p>
        </section>
      </main>
    );
  }

  return <>{children(session)}</>;
}
