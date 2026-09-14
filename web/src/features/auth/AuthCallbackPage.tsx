"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { completeKeycloakSignIn, signedInHomePath } from "@/lib/authClient";
import styles from "./AuthState.module.css";

export function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeKeycloakSignIn(window.location.search)
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
