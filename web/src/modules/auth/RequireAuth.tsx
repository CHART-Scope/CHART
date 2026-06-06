"use client";

import { useEffect, useState, type ReactNode } from "react";

import { getSetupStatus } from "../../lib/setupClient";
import {
  getStoredAuthSession,
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

  useEffect(() => {
    async function checkAccess() {
      const storedSession = getStoredAuthSession();

      if (!storedSession) {
        await startKeycloakSignIn();
        return;
      }

      const setupStatus = await getSetupStatus();

      if (
        setupStatus.requiresOnboarding &&
        window.location.pathname !== "/onboarding"
      ) {
        window.location.assign("/onboarding");
        return;
      }

      setSession(storedSession);
      setIsChecking(false);
    }

    checkAccess().catch(() => {
      setError("CHART setup status could not be checked.");
      setIsChecking(false);
    });
  }, []);

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
