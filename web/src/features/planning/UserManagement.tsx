"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Panel } from "@/components/Panel";
import { Select } from "@/components/Select";
import { TextInput } from "@/components/TextInput";
import { resetInstallation } from "@/lib/setupClient";
import {
  inviteUser,
  listAdminGeographies,
  listManagedUsers,
  type AdminGeography,
  type ChartRole,
  type ManagedUser,
} from "@/lib/userAdminClient";
import styles from "./UserManagement.module.css";

const roles: { value: ChartRole; label: string }[] = [
  { value: "health_planning_lead", label: "Health planning lead" },
  { value: "cross_sector_planning_lead", label: "Cross-sector planning lead" },
  {
    value: "health_implementation_officer",
    label: "Health implementation officer",
  },
  {
    value: "cross_sector_implementation_officer",
    label: "Cross-sector implementation officer",
  },
  { value: "content_editor", label: "Content editor" },
  { value: "public_viewer", label: "Public viewer" },
  { value: "chart_admin", label: "CHART administrator" },
];

type FormState = {
  name: string;
  email: string;
  password: string;
  role: ChartRole;
  geographyId: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  password: "",
  role: "health_planning_lead",
  geographyId: "",
};

const RESET_CONFIRM_PHRASE = "RESET";

export function UserManagement({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [geographies, setGeographies] = useState<AdminGeography[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function performReset() {
    setIsResetting(true);
    setResetError(null);
    try {
      await resetInstallation(accessToken);
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([listManagedUsers(accessToken), listAdminGeographies(accessToken)])
      .then(([nextUsers, nextGeographies]) => {
        if (cancelled) return;
        setUsers(nextUsers);
        setGeographies(nextGeographies);
        setForm((current) => ({
          ...current,
          geographyId: current.geographyId || nextGeographies[0]?.id || "",
        }));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "People and planning areas could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await inviteUser(form, accessToken);
      setUsers((current) => [
        created,
        ...current.filter((user) => user.userId !== created.userId),
      ]);
      setMessage(
        `${created.displayName} can now sign in with the assigned role and planning area.`,
      );
      setForm((current) => ({
        ...initialForm,
        role: current.role,
        geographyId: current.geographyId,
      }));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "CHART could not create this account.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const canSubmit =
    form.name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.password.length >= 8 &&
    !!form.geographyId;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Administration</span>
          <h1>People &amp; access</h1>
          <p>
            Assign each person a role and planning area before they sign in. They will
            not see installation onboarding.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <Panel pad="lg" eyebrow="Invite a person" title="Create their CHART account">
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <TextInput
              id="invite-name"
              label="Full name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.currentTarget.value,
                }))
              }
              autoComplete="name"
            />
            <TextInput
              id="invite-email"
              label="Email address"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.currentTarget.value,
                }))
              }
              autoComplete="email"
            />
            <Select
              id="invite-role"
              label="CHART role"
              fullWidth
              value={form.role}
              options={roles}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.currentTarget.value as ChartRole,
                }))
              }
            />
            <Select
              id="invite-geography"
              label="Planning area"
              fullWidth
              value={form.geographyId}
              placeholder="— Choose a planning area —"
              options={geographies.map((geography) => ({
                value: geography.id,
                label: `${geography.name} · ${geography.levelLabel}`,
              }))}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  geographyId: event.currentTarget.value,
                }))
              }
            />
            <TextInput
              id="invite-password"
              label="Temporary password"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.currentTarget.value,
                }))
              }
              autoComplete="new-password"
            />
            <p className={styles.help}>
              Share the temporary sign-in details securely. The account is provisioned
              in Keycloak with its access already assigned.
            </p>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className={styles.success} role="status">
                {message}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={!canSubmit || isSaving}
              trailingIcon={<Icon name="arrow-right" size={14} />}
            >
              {isSaving ? "Creating account…" : "Create invited account"}
            </Button>
          </form>
        </Panel>

        <Panel pad="lg" eyebrow="Current access" title="People in this installation">
          {isLoading ? (
            <p className={styles.empty}>Loading people…</p>
          ) : users.length === 0 ? (
            <p className={styles.empty}>No accounts have been added yet.</p>
          ) : (
            <div className={styles.userList}>
              {users.map((user) => (
                <article key={user.userId} className={styles.user}>
                  <div className={styles.avatar} aria-hidden>
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{user.displayName}</strong>
                    <span>{user.email ?? user.username}</span>
                    <small>
                      {roleLabel(user.roles[0])} ·{" "}
                      {user.geographyScopes.map((scope) => scope.name).join(", ") ||
                        "No planning area"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className={styles.dangerZone}>
        <div>
          <strong>Reset this CHART installation</strong>
          <p>
            Deletes all workspaces and their members, and returns CHART to the
            first-run setup wizard. Sign-in identities in Keycloak are not touched.
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
              disabled={
                resetConfirmText !== RESET_CONFIRM_PHRASE || isResetting
              }
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
    </div>
  );
}

function roleLabel(role?: ChartRole) {
  return roles.find((option) => option.value === role)?.label ?? "No role";
}
