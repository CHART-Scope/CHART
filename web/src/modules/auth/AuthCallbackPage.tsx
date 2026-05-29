"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { completeKeycloakSignIn } from "./authClient";

export function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeSignIn() {
      try {
        await completeKeycloakSignIn(window.location.search);
        router.replace("/dashboard");
      } catch {
        setError("The Keycloak sign-in response could not be completed.");
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
        {error ? (
          <button
            className="button primary-button"
            type="button"
            onClick={() => router.push("/signin")}
          >
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}
