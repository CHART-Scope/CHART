"use client";

import { useQuery } from "@tanstack/react-query";

import { SettingsCard } from "@/features/planning/SettingsCard";
import { MODULE_LABELS, type Level } from "@/lib/access";
import { listRoles, type Workspace } from "@/lib/workspaceClient";

import styles from "./Access.module.css";

const LEVEL_LABELS: Record<Level, string> = {
  read: "Read",
  write: "Write",
  manage: "Manage",
};

/** Settings > Roles: what each role may do per area. Read only for now. */
export function RolesCard({ workspace }: { workspace: Workspace }) {
  const roles = useQuery({
    queryKey: ["workspace", workspace.id, "roles"],
    queryFn: ({ signal }) => listRoles(workspace.id, signal),
  });
  return (
    <SettingsCard
      eyebrow="Roles"
      title="What each role may do"
      headingId="roles-heading"
      description="Read sees, write changes, manage also controls others' work and settings. Write in actions, data and VRA reaches only what the person's departments own, unless they manage it."
      loading={roles.isPending}
      error={roles.error ? (roles.error as Error).message : null}
    >
      {roles.data ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Role capabilities">
            <thead>
              <tr>
                <th scope="col">Area</th>
                {roles.data.items.map((role) => (
                  <th key={role.id} scope="col">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.data.modules.map((module) => (
                <tr key={module}>
                  <th scope="row">{MODULE_LABELS[module]}</th>
                  {roles.data.items.map((role) => {
                    const level = role.capabilities[module];
                    return (
                      <td key={role.id}>
                        {level ? (
                          <span className={styles.tag}>{LEVEL_LABELS[level]}</span>
                        ) : (
                          <span className={styles.meta} aria-label="None">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SettingsCard>
  );
}
