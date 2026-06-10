"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    setSession(getStoredAuthSession());
  }, []);

  if (session) {
    return (
      <a className={className} href="/dashboard">
        {signedInLabel}
      </a>
    );
  }

  return (
    <a className={className} href="/auth/signin">
      {signedOutLabel}
    </a>
  );
}
