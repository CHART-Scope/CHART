"use client";

import { useEffect, useState } from "react";

import { getStoredAuthSession, type AuthSession } from "./authClient";

export function PublicAuthAction() {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    setSession(getStoredAuthSession());
  }, []);

  if (session) {
    return (
      <a className="button primary-button nav-sign-in" href="/dashboard">
        Open workspace
      </a>
    );
  }

  return (
    <a className="button primary-button nav-sign-in" href="/auth/signin">
      Sign in
    </a>
  );
}
