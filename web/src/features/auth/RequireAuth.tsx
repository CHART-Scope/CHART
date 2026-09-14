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
}: {
  children: (session: AuthSession) => ReactNode;
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
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span>CHART secure workspace</span>
          <h1>Opening sign in</h1>
          <p>Checking your role and planning area.</p>
        </section>
      </main>
    );
  }

  return <>{children(session)}</>;
}
