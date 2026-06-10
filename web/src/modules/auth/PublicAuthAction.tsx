"use client";

import { useEffect, useState } from "react";

import { getSetupStatus } from "../../lib/setupClient";
import { getStoredAuthSession, type AuthSession } from "./authClient";

type PublicAuthActionProps = {
  className?: string;
  signedInLabel?: string;
  signedOutLabel?: string;
};

export function PublicAuthAction({
  className = "button primary-button nav-sign-in",
  signedInLabel = "Open workspace",
  signedOutLabel = "Sign in",
}: PublicAuthActionProps = {}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [requiresOnboarding, setRequiresOnboarding] = useState(false);

  useEffect(() => {
    const storedSession = getStoredAuthSession();

    setSession(storedSession);

    if (storedSession) {
      return;
    }

    getSetupStatus()
      .then((status) => {
        setRequiresOnboarding(status.requiresOnboarding);
      })
      .catch(() => {
        setRequiresOnboarding(false);
      });
  }, []);

  if (session) {
    return (
      <a className={className} href="/dashboard">
        {signedInLabel}
      </a>
    );
  }

  return (
    <a className={className} href={requiresOnboarding ? "/onboarding" : "/auth/signin"}>
      {requiresOnboarding ? "Start setup" : signedOutLabel}
    </a>
  );
}
