"use client";

import { useEffect, useState } from "react";

import {
  listManagedUsers,
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

type Props = {
  accessToken: string;
};

export function UserManagement({ accessToken }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <SettingsCard
      eyebrow="Administration"
      title="People and access"
      headingId="people-access-heading"
    >
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : isLoading ? (
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
                {(user.email ?? user.username) !== user.displayName ? (
                  <span>{user.email ?? user.username}</span>
                ) : null}
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
    </SettingsCard>
  );
}

function roleLabel(role?: ChartRole) {
  return roles.find((option) => option.value === role)?.label ?? "No role";
}
