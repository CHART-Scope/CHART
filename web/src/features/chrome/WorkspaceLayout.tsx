"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { IconSprite } from "@/components/Icon";
import { IdleWarning } from "@/features/auth/IdleWarning";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { WorkspaceSessionProvider } from "@/features/auth/WorkspaceSession";
import loginStyles from "@/features/onboarding/Login.module.css";
import {
  getStoredAuthSession,
  restoreAuthSession,
  signOutOfKeycloak,
  startKeycloakSignIn,
  type AuthSession,
} from "@/lib/authClient";

import {
  activeNavForPath,
  appNavForRoles,
  isPublicPath,
  redirectForPath,
} from "./appNav";
import { RouteSkeleton } from "./PageSkeleton";

/**
 * The signed-in chrome, mounted once for every workspace route.
 *
 * Each page used to restore the session and draw its own shell, so every
 * navigation unmounted the sidebar and top bar and rebuilt them after a
 * placeholder frame. Living in a layout, the shell stays mounted while the
 * content area changes; pages read the session with `useSession()`.
 *
 * While the session is restored (a hard load) the same shell is drawn with
 * its nav in skeleton and a content placeholder, so the frame never blanks.
 *
 * The Learning hub is public. A guest reads it under the public header; a
 * signed-in user reads it inside this same shell.
 */
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = isPublicPath(pathname);
  const visitor = useVisitor(isPublic);

  if (isPublic && visitor !== "member") {
    return (
      <>
        <IconSprite />
        {visitor === "guest" ? (
          <PublicFrame>{children}</PublicFrame>
        ) : (
          // Unknown yet: the guest view of the content, in the loading shell,
          // so a signed-in reader never sees the public "Sign in" header.
          <ShellFrame session={null} pathname={pathname}>
            {children}
          </ShellFrame>
        )}
      </>
    );
  }

  return (
    <>
      <IconSprite />
      <RequireAuth
        fallback={
          <ShellFrame session={null} pathname={pathname}>
            <RouteSkeleton pathname={pathname} />
          </ShellFrame>
        }
      >
        {(restored) => {
          const session = latestSession(restored);
          return (
            <ShellFrame session={session} pathname={pathname}>
              <RouteGuard session={session} pathname={pathname}>
                {children}
              </RouteGuard>
            </ShellFrame>
          );
        }}
      </RequireAuth>
    </>
  );
}

/**
 * Whether a public route is being read by a member or a guest. Protected
 * routes leave this to RequireAuth; once a session is in memory (restored by
 * either), every route renders through RequireAuth so the shell stays put.
 */
function useVisitor(isPublic: boolean): "unknown" | "guest" | "member" {
  const [visitor, setVisitor] = useState<"unknown" | "guest" | "member">(() =>
    getStoredAuthSession() ? "member" : "unknown",
  );
  const known = getStoredAuthSession() ? "member" : visitor;

  useEffect(() => {
    if (!isPublic || known !== "unknown") return;
    let cancelled = false;
    restoreAuthSession()
      .then(() => {
        if (!cancelled) setVisitor("member");
      })
      .catch(() => {
        // Visitors can browse without a session.
        if (!cancelled) setVisitor("guest");
      });
    return () => {
      cancelled = true;
    };
  }, [isPublic, known]);

  return known;
}

function ShellFrame({
  session,
  pathname,
  children,
}: {
  session: AuthSession | null;
  pathname: string | null;
  children: ReactNode;
}) {
  return (
    <AppShell
      nav={session ? appNavForRoles(session.user.roles) : []}
      activeNav={activeNavForPath(pathname) ?? ""}
      loading={!session}
      onSignOut={session ? signOutOfKeycloak : undefined}
      userLabel={session?.user.username}
    >
      {children}
      {session ? <IdleWarning /> : null}
    </AppShell>
  );
}

/** Role and planning-area checks for the route, with a placeholder (inside
 * the shell) while a denied user is redirected. */
function RouteGuard({
  session,
  pathname,
  children,
}: {
  session: AuthSession;
  pathname: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const redirectTo = redirectForPath(pathname, session.user);

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (redirectTo) return <RouteSkeleton pathname={pathname} />;
  return (
    <WorkspaceSessionProvider session={session}>{children}</WorkspaceSessionProvider>
  );
}

function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className={loginStyles.page}>
      <header className={loginStyles.header}>
        <a className={loginStyles.brand} href="/" aria-label="CHART home">
          CHART
        </a>
        <Button onClick={startKeycloakSignIn}>Sign in</Button>
      </header>
      <div className={loginStyles.publicContent}>{children}</div>
    </div>
  );
}

/**
 * `rememberActiveGeography` replaces the stored session when the user picks a
 * place. Pages used to remount and re-read it on every navigation; with a
 * persistent layout the stored copy is read on each render instead (every
 * route change re-renders the layout), so /plan still opens on the place last
 * chosen.
 */
function latestSession(session: AuthSession): AuthSession {
  const stored = getStoredAuthSession();
  return stored?.user.userId === session.user.userId ? stored : session;
}
