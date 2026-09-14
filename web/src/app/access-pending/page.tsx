"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { Icon, IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import {
  restoreAuthSession,
  signedInHomePath,
  signOutOfKeycloak,
} from "@/lib/authClient";
import styles from "./page.module.css";

export default function AccessPendingPage() {
  return (
    <RequireAuth>
      {(session) => (
        <PendingAccess username={session.user.username} onSignOut={signOutOfKeycloak} />
      )}
    </RequireAuth>
  );
}

function PendingAccess({
  username,
  onSignOut,
}: {
  username: string;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function checkAgain() {
    setIsChecking(true);
    setMessage(null);
    try {
      const session = await restoreAuthSession();
      const path = signedInHomePath(session.user);
      if (path === "/access-pending") {
        setMessage(
          "Access is still pending. Ask the administrator of this CHART instance to invite this account.",
        );
      } else {
        router.replace(path);
      }
    } catch {
      setMessage("CHART could not refresh this account. Try signing in again.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <>
      <IconSprite />
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.mark}>
            <Icon name="users" size={24} />
          </div>
          <span className={styles.eyebrow}>Signed in as {username}</span>
          <h1>Your account has not been invited yet</h1>
          <p>
            This CHART installation is already configured. Its administrator assigns
            each person a role and planning area before they can enter the workspace.
            You do not need to repeat installation setup.
          </p>
          {message ? (
            <p className={styles.message} role="status">
              {message}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => void checkAgain()} disabled={isChecking}>
              {isChecking ? "Checking access…" : "Check access again"}
            </Button>
            <Button variant="secondary" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
