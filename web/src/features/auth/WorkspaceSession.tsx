"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AuthSession } from "@/lib/authClient";

const WorkspaceSessionContext = createContext<AuthSession | null>(null);

/** Hands the session the workspace layout restored to the pages inside it. */
export function WorkspaceSessionProvider({
  session,
  children,
}: {
  session: AuthSession | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceSessionContext.Provider value={session}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

/**
 * The signed-in session, for pages the workspace layout only renders once a
 * session exists. Throws rather than returning null so a page that forgets it
 * is outside the shell fails loudly instead of rendering signed out.
 */
export function useSession(): AuthSession {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error("useSession() needs the workspace layout's session.");
  return session;
}

/** The session when there is one; for public pages that read better signed in. */
export function useOptionalSession(): AuthSession | null {
  return useContext(WorkspaceSessionContext);
}
