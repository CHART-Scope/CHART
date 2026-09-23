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
// Tracked at module scope so the guard survives a remount, unlike a ref; a
// full page reload starts a fresh module, which the recovery below covers.
const exchangedCodes = new Set<string>();

export function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.search).get("code");
    const alreadyExchanged = code !== null && exchangedCodes.has(code);
    if (code) exchangedCodes.add(code);

    // Recover from the session cookies only when the code was already
    // exchanged. A genuine exchange failure must still fail, so that a bad
    // sign-in can never silently land on somebody else's live session.
    const signIn = alreadyExchanged
      ? restoreAuthSession()
      : completeKeycloakSignIn(window.location.search).catch((cause: Error) => {
          if (cause.name !== "AUTH_CALLBACK_INVALID") throw cause;
          return restoreAuthSession();
        });

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
