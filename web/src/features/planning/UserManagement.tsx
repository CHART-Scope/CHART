"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { TextInput } from "@/components/TextInput";
import { useGeographies } from "@/lib/useGeographies";
import {
  invitePerson,
  listManagedUsers,
  resendInvitation,
  type ChartRole,
  type ManagedUser,
} from "@/lib/userAdminClient";
import { SettingsCard } from "./SettingsCard";
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  accessToken: string;
};

type Notice = { tone: "status" | "alert"; text: string };

export function UserManagement({ accessToken }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listManagedUsers(accessToken)
      .then((nextUsers) => {
        if (!cancelled) setUsers(nextUsers);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "People could not be loaded.",
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

  async function resend(user: ManagedUser) {
    setResending(user.userId);
    setNotice(null);
    try {
      await resendInvitation(user.userId, accessToken);
      setNotice({
        tone: "status",
        text: `Invitation sent again to ${user.email ?? user.username}.`,
      });
    } catch (resendError) {
      setNotice({ tone: "alert", text: messageOf(resendError) });
    } finally {
      setResending(null);
    }
  }

  return (
    <SettingsCard
      eyebrow="Administration"
      title="People and access"
      headingId="people-access-heading"
    >
      <p className={styles.intro}>
        Invite the people who plan with CHART. They get an email, then sign in with
        their email address and a 6-character code CHART emails them; there are no
        passwords. Their role and planning area decide what they can see.
      </p>
      <InviteForm
        accessToken={accessToken}
        onInvited={(user) => {
          setUsers((current) => [
            user,
            ...current.filter((item) => item.userId !== user.userId),
          ]);
          const address = user.email ?? user.username;
          setNotice(
            user.invitation === "failed"
              ? {
                  tone: "alert",
                  text: `${address} was added, but the invitation email could not be sent. Use “Send invitation again” once CHART's email works.`,
                }
              : { tone: "status", text: `Invitation sent to ${address}.` },
          );
        }}
      />
      {notice ? (
        <p
          className={notice.tone === "alert" ? styles.error : styles.success}
          role={notice.tone}
        >
          {notice.text}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : isLoading ? (
        <p className={styles.empty}>Loading people…</p>
      ) : users.length === 0 ? (
        <p className={styles.empty}>No one has been invited yet.</p>
      ) : (
        <div className={styles.userList}>
          {users.map((user) => (
            <article key={user.userId} className={styles.user}>
              <div className={styles.avatar} aria-hidden>
                {user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{user.displayName}</strong>
                {(user.email ?? user.username) !== user.displayName ? (
                  <span>{user.email ?? user.username}</span>
                ) : null}
                <small>
                  {roleLabel(user.roles[0])} ·{" "}
                  {user.geographyScopes.map((scope) => scope.name).join(", ") ||
                    "No planning area"}
                  {user.status === "disabled" ? " · Turned off" : ""}
                </small>
              </div>
              {user.status === "active" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resending === user.userId}
                  aria-label={`Send invitation again to ${user.email ?? user.username}`}
                  onClick={() => resend(user)}
                >
                  {resending === user.userId ? "Sending…" : "Send invitation again"}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function InviteForm({
  accessToken,
  onInvited,
}: {
  accessToken: string;
  onInvited: (user: ManagedUser) => void;
}) {
  const { geographies } = useGeographies();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ChartRole>("health_planning_lead");
  const [geographyId, setGeographyId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countries and their first level (a state or county): an area covers
  // everything inside it, so finer choices are rarely what an invite needs.
  // Read from the hierarchy; paths carry level words (/kenya/county/…).
  const areas = useMemo(() => {
    const records = geographies ?? [];
    const countries = new Set(
      records.filter((geo) => !geo.parentId).map((geo) => geo.id),
    );
    return records
      .filter((geo) => !geo.parentId || countries.has(geo.parentId))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((geo) => ({ value: geo.id, label: `${geo.name} · ${geo.levelLabel}` }));
  }, [geographies]);
  const ready =
    name.trim().length >= 2 && emailPattern.test(email.trim()) && !!geographyId;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      onInvited(await invitePerson({ name, email, role, geographyId }, accessToken));
      setName("");
      setEmail("");
    } catch (inviteError) {
      setError(messageOf(inviteError));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className={styles.inviteForm} onSubmit={submit} aria-label="Invite a person">
      <TextInput
        id="invite-name"
        label="Full name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        autoComplete="off"
      />
      <TextInput
        id="invite-email"
        label="Email address"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
        autoComplete="off"
      />
      <Select
        label="Role"
        options={roles}
        value={role}
        onChange={(value) => setRole(value as ChartRole)}
        fullWidth
      />
      <Select
        label="Planning area"
        placeholder={geographies ? "Choose an area" : "Loading areas…"}
        options={areas}
        value={geographyId}
        onChange={setGeographyId}
        fullWidth
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!ready || isSending}>
        {isSending ? "Sending invitation…" : "Send invitation"}
      </Button>
    </form>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "CHART could not complete that.";
}

function roleLabel(role?: ChartRole) {
  return roles.find((option) => option.value === role)?.label ?? "No role";
}
