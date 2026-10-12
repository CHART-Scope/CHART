"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  completeKeycloakSignIn,
  restoreAuthSession,
  signedInHomePath,
} from "@/lib/authClient";
import styles from "./AuthState.module.css";

// An authorization code is single-use and a successful exchange clears the
// PKCE cookie, so exchanging the same code twice fails with
// AUTH_CALLBACK_INVALID even though the first exchange signed the user in.
// A remount reuses the pending exchange from module memory, and codes this tab
// exchanged are kept in sessionStorage, which is per tab and survives a
// reload. Only such a code may recover from the session cookies: the exchange also returns AUTH_CALLBACK_INVALID for an
// expired PKCE cookie or a state mismatch, and recovering there would land a
// failed sign-in on whoever's session is already in the browser.
const exchangedCodesKey = "chart.auth.exchangedCodes";
const pendingExchanges = new Map<string, ReturnType<typeof completeKeycloakSignIn>>();

function readExchangedCodes(): string[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(exchangedCodesKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberExchangedCode(code: string) {
  try {
    const codes = [...readExchangedCodes().filter((v) => v !== code), code];
    sessionStorage.setItem(exchangedCodesKey, JSON.stringify(codes.slice(-5)));
  } catch {
    // Storage blocked: pendingExchanges still covers a remount.
  }
}

export function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.search).get("code");
    const pending = code ? pendingExchanges.get(code) : undefined;

    // A genuine exchange failure must still fail, so that a bad sign-in can
    // never silently land on somebody else's live session.
    const signIn =
      pending ??
      (code && readExchangedCodes().includes(code)
        ? restoreAuthSession()
        : completeKeycloakSignIn(window.location.search).then((session) => {
            if (code) rememberExchangedCode(code);
            return session;
          }));
    if (code && !pending) pendingExchanges.set(code, signIn);

    signIn
      .then((session) => router.replace(signedInHomePath(session.user)))
      .catch(() => setError("The sign-in response could not be completed."));
  }, [router]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span>CHART secure workspace</span>
        <h1>{error ? "Sign-in failed" : "Completing sign in"}</h1>
        <p>{error ?? "Verifying your role and planning area."}</p>
      </section>
    </main>
  );
}
