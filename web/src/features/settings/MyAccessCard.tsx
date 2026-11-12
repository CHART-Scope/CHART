"use client";

import { SettingsCard } from "@/features/planning/SettingsCard";
import type { AccessHolder } from "@/lib/access";

import styles from "./Access.module.css";

/** Settings > Workspace: the roles you hold, where, and your departments. */
export function MyAccessCard({ user }: { user: AccessHolder }) {
  return (
    <SettingsCard
      eyebrow="Your access"
      title="What you can do in CHART"
      headingId="my-access-heading"
      description="A role covers its place and everything below it; places above yours read as context. Ask a workspace admin to change your access."
    >
      {user.isPlatformAdmin ? (
        <p className={styles.note}>
          You are a platform admin: you manage every workspace on this installation.
        </p>
      ) : null}
      {user.workspaces.length === 0 && !user.isPlatformAdmin ? (
        <p className={styles.note}>
          You have no access yet. Ask a workspace admin to invite you.
        </p>
      ) : null}
      <ul className={styles.list} aria-label="My grants">
        {user.workspaces.flatMap((workspace) =>
          workspace.grants.map((grant) => (
            <li
              key={`${workspace.workspaceId}-${grant.geographyId}`}
              className={styles.row}
            >
              <span className={styles.who}>
                <span className={styles.name}>
                  {grant.roleName} · {grant.placeName}
                </span>
                <span className={styles.meta}>{workspace.name}</span>
              </span>
              <span className={styles.tags}>
                {workspace.departments.map((department) => (
                  <span key={department.id} className={styles.tag}>
                    {department.name}
                  </span>
                ))}
              </span>
            </li>
          )),
        )}
      </ul>
    </SettingsCard>
  );
}
