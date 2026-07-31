"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";


export default function HomePage() {
  return (
    <RequireAuth>
      {(session) => <AuthorizedHome session={session} />}
    </RequireAuth>
  );
}


function AuthorizedHome({ session }: { session: AuthSession }) {
  const router = useRouter();
  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  return (
    <>
      <IconSprite />
      <AppShell
        nav={appNavForRoles(session.user.roles)}
        activeNav="home"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4a4a4a",
              margin: 0,
            }}
          >
            Home
          </p>
          <h1
            style={{
              fontFamily:
                "var(--font-serif, Georgia, 'Times New Roman', serif)",
              fontSize: "1.6rem",
              margin: "0.4rem 0 1rem",
              fontWeight: 500,
            }}
          >
            Welcome to CHART
          </h1>
          <p style={{ color: "#4a4a4a", lineHeight: 1.6 }}>
            The home experience is still being built. Head to{" "}
            <a href="/plan" style={{ color: "#7a1a4a" }}>
              Planning center
            </a>{" "}
            to open the risk dashboard for your area.
          </p>
        </main>
      </AppShell>
    </>
  );
}
