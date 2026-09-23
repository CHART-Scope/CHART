"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  ensureFreshAuthSession,
  getStoredAuthSession,
  refreshDelay,
  restoreAuthSession,
  startKeycloakSignIn,
  type AuthSession,
} from "@/lib/authClient";
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const redirected = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredAuthSession();
    if (!stored) {
      restoreAuthSession()
        .then((fresh) => {
          if (!cancelled) setSession(fresh);
        })
        .catch(redirect);
      return () => {
        cancelled = true;
      };
    }

    ensureFreshAuthSession(stored)
      .then((fresh) => {
        if (!cancelled) setSession(fresh);
      })
      .catch(redirect);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const delay = refreshDelay(session.accessToken);
    if (delay === null) return;
    const timeout = window.setTimeout(() => {
      ensureFreshAuthSession(session).then(setSession).catch(redirect);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [session]);

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
