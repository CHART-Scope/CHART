"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { clearAuthSession, getStoredAuthSession, type AuthSession } from "./authClient";

type RequireAuthProps = {
  children: (session: AuthSession, signOut: () => void) => ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const storedSession = getStoredAuthSession();

    if (!storedSession) {
      router.replace("/signin?returnTo=/dashboard");
      return;
    }

    setSession(storedSession);
    setIsChecking(false);
  }, [router]);

  function signOut() {
    clearAuthSession();
    router.replace("/");
  }

  if (isChecking || !session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="section-kicker">CHART secure workspace</span>
          <h1>Checking access</h1>
          <p>CHART is checking your signed-in user role and geography scope.</p>
        </section>
      </main>
    );
  }

  return <>{children(session, signOut)}</>;
}
