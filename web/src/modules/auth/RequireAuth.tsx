"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { getSetupStatus } from "../../lib/setupClient";
import {
  accessTokenRefreshDelay,
  ensureFreshAuthSession,
  getStoredAuthSession,
  refreshAuthSession,
  signOutOfKeycloak,
  startKeycloakSignIn,
  type AuthSession,
} from "./authClient";

type RequireAuthProps = {
  children: (session: AuthSession, signOut: (returnTo?: string) => void) => ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const storedSession = getStoredAuthSession();

      if (!storedSession) {
        const setupStatus = await getSetupStatus();

        if (
          setupStatus.requiresOnboarding &&
          window.location.pathname !== "/onboarding"
        ) {
          window.location.assign("/onboarding");
          return;
        }

        redirectToSignIn();
        return;
      }

      const activeSession = await ensureFreshAuthSession(storedSession);
      if (cancelled) {
        return;
      }
      setSession(activeSession);
      setIsChecking(false);

      const setupStatus = await getSetupStatus();

      if (
        setupStatus.requiresOnboarding &&
        window.location.pathname !== "/onboarding"
      ) {
        window.location.assign("/onboarding");
      }
    }

    checkAccess().catch(() => {
      if (!cancelled) {
        redirectToSignIn();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const delay = accessTokenRefreshDelay(session.accessToken);
    if (delay === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      refreshAuthSession(session).then(setSession).catch(redirectToSignIn);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [session]);

  function redirectToSignIn() {
    if (hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    startKeycloakSignIn();
  }

  function signOut(returnTo?: string) {
    signOutOfKeycloak(returnTo);
  }

  if (isChecking || !session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="section-kicker">CHART secure workspace</span>
          <h1>Opening CHART sign in</h1>
          <p>
            {error ??
              "CHART is sending you to the secure sign-in service for your role and geography scope."}
          </p>
        </section>
      </main>
    );
  }

  return <>{children(session, signOut)}</>;
}
