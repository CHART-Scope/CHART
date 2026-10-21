"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import {
  IDLE_TIMEOUT_MS,
  keepSessionActive,
  msUntilIdleSignOut,
  signOutOfKeycloak,
} from "@/lib/authClient";

/** How long before the idle sign-out the warning appears. */
export const IDLE_WARNING_MS = 2 * 60_000;

/**
 * "Still there?" for the last two minutes before an idle sign-out, so a
 * reader is never signed out without a chance to stay. Any activity (even
 * moving the pointer) closes it; the sign-out itself stays in authClient.
 */
export function IdleWarning() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilIdleSignOut());
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);

  const open = remaining !== null && remaining <= IDLE_WARNING_MS;
  const seconds = Math.ceil((remaining ?? 0) / 1_000);
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <Modal
      open={open}
      onClose={keepSessionActive}
      size="sm"
      title="Still there?"
      description={`For security, CHART signs you out after ${IDLE_TIMEOUT_MS / 60_000} minutes without activity.`}
      footer={
        <>
          <Button variant="secondary" onClick={signOutOfKeycloak}>
            Sign out
          </Button>
          <Button onClick={keepSessionActive}>Stay signed in</Button>
        </>
      }
    >
      <p role="timer" aria-live="off">
        Signing out in <strong>{countdown}</strong>
      </p>
    </Modal>
  );
}
