"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";


export default function LearningPage() {
  return (
    <RequireAuth>
      {(session) => <AuthorizedLearning session={session} />}
    </RequireAuth>
  );
}


function AuthorizedLearning({ session }: { session: AuthSession }) {
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
        activeNav="learning"
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
            Learning
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
            Learning hub
          </h1>
          <p style={{ color: "#4a4a4a", lineHeight: 1.6 }}>
            The Learning hub is coming soon. It will host guides on interpreting
            the risk maps, the science behind heat-attributable low birth
            weight, and CHART&apos;s methodology.
          </p>
        </main>
      </AppShell>
    </>
  );
}
