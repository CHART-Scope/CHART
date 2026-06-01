"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { completeKeycloakSignIn } from "./authClient";

export function AuthCallbackPage() {
  const router = useRouter();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    async function completeSignIn() {
      try {
        await completeKeycloakSignIn(window.location.search);
        router.replace("/dashboard");
      } catch {
        setError("The CHART sign-in response could not be completed.");
      }
    }

    void completeSignIn();
  }, [router]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="section-kicker">CHART secure workspace</span>
        <h1>{error ? "Sign-in failed" : "Completing sign-in"}</h1>
        <p>
          {error ??
            "Please wait while CHART verifies your user role and geography scope."}
        </p>
      </section>
    </main>
  );
}
