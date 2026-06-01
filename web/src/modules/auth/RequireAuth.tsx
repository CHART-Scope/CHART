"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  getStoredAuthSession,
  signOutOfKeycloak,
  startKeycloakSignIn,
  type AuthSession,
} from "./authClient";

type RequireAuthProps = {
  children: (session: AuthSession, signOut: () => void) => ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const storedSession = getStoredAuthSession();

    if (!storedSession) {
      void startKeycloakSignIn();
      return;
    }

    setSession(storedSession);
    setIsChecking(false);
  }, []);

  function signOut() {
    signOutOfKeycloak();
  }

  if (isChecking || !session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="section-kicker">CHART secure workspace</span>
          <h1>Opening CHART sign in</h1>
          <p>
            CHART is sending you to the secure sign-in service for your role and
            geography scope.
          </p>
        </section>
      </main>
    );
  }

  return <>{children(session, signOut)}</>;
}
