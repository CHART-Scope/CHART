"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  getConfiguredAuthMode,
  signInWithDemoApi,
  startKeycloakSignIn,
} from "./authClient";

export function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const authMode = getConfiguredAuthMode();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  async function handleDemoSignIn() {
    setStatus("loading");
    setError(null);

    try {
      await signInWithDemoApi();
      router.push(returnTo);
    } catch {
      setStatus("idle");
      setError("Could not sign in. Check that the CHART API is running.");
    }
  }

  async function handleKeycloakSignIn() {
    setStatus("loading");
    setError(null);

    try {
      await startKeycloakSignIn();
    } catch {
      setStatus("idle");
      setError("Could not start Keycloak sign-in.");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div>
          <span className="section-kicker">CHART secure workspace</span>
          <h1>Sign in to continue planning</h1>
          <p>
            Public resources stay open. The dashboard, geography context, and planning
            workspace require a CHART user role and geography scope.
          </p>
        </div>

        <div className="auth-summary-card">
          <strong>Local demo user</strong>
          <span>U1 health lead · Madhya Pradesh · can view child districts</span>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        {authMode === "keycloak" ? (
          <button
            className="button primary-button"
            disabled={status === "loading"}
            type="button"
            onClick={handleKeycloakSignIn}
          >
            {status === "loading" ? "Starting sign-in..." : "Continue with Keycloak"}
          </button>
        ) : (
          <button
            className="button primary-button"
            disabled={status === "loading"}
            type="button"
            onClick={handleDemoSignIn}
          >
            {status === "loading" ? "Signing in..." : "Continue as demo health lead"}
          </button>
        )}

        <button
          className="button ghost-button"
          type="button"
          onClick={() => router.push("/")}
        >
          Back to public site
        </button>
      </section>
    </main>
  );
}
