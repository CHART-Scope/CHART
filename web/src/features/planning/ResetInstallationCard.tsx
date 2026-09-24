"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import { resetAuditSession, stopAuditFlush } from "@/lib/audit";
import { clearStoredAuthSession } from "@/lib/authClient";
import { resetInstallation } from "@/lib/setupClient";
import styles from "./UserManagement.module.css";

const RESET_CONFIRM_PHRASE = "RESET";

export function ResetInstallationCard({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function performReset() {
    setIsResetting(true);
    setResetError(null);
    try {
      await resetInstallation(accessToken);
      stopAuditFlush();
      resetAuditSession();
      clearStoredAuthSession();
      router.replace("/onboarding");
    } catch (thrown) {
      setResetError(
        thrown instanceof Error
          ? thrown.message
          : "CHART could not reset the installation.",
      );
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <>
      <div className={styles.dangerZone}>
        <div>
          <strong>Reset this CHART installation</strong>
          <p>
            Deletes all workspaces and their members, and returns CHART to the first-run
            setup wizard. Sign-in identities in Keycloak are not touched.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setResetError(null);
            setResetConfirmText("");
            setShowResetDialog(true);
          }}
        >
          Reset installation
        </Button>
      </div>

      <Modal
        size="lg"
        open={showResetDialog}
        onClose={() => {
          if (!isResetting) setShowResetDialog(false);
        }}
        title="Reset this CHART installation"
        description="This cannot be undone. All workspaces and their members will be removed and CHART will require first-run setup again."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void performReset()}
              disabled={resetConfirmText !== RESET_CONFIRM_PHRASE || isResetting}
            >
              {isResetting ? "Resetting…" : "Reset installation"}
            </Button>
          </>
        }
      >
        <div className={styles.dangerConfirm}>
          <label htmlFor="reset-confirm">
            Type <code>{RESET_CONFIRM_PHRASE}</code> to confirm.
          </label>
          <TextInput
            id="reset-confirm"
            label=""
            value={resetConfirmText}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setResetConfirmText(value);
            }}
            autoComplete="off"
          />
          {resetError ? (
            <p className={styles.error} role="alert">
              {resetError}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
