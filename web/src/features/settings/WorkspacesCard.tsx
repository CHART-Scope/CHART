"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/Button";
import { InlineSelect } from "@/components/InlineSelect";
import { SettingsCard } from "@/features/planning/SettingsCard";
import { useGeographies } from "@/lib/useGeographies";
import { createWorkspace } from "@/lib/workspaceClient";

import styles from "./Access.module.css";
import { workspacesQueryKey, type WorkspaceChoice } from "./WorkspaceChoice";

/** Settings > Workspaces (platform admins): one workspace per installed
 * country, and creating one for a country that has none. */
export function WorkspacesCard({ choice }: { choice: WorkspaceChoice }) {
  const queryClient = useQueryClient();
  const { geographies } = useGeographies();
  const taken = new Set((choice.workspaces ?? []).map((item) => item.country_code));
  const countries = (geographies ?? []).filter(
    (geo) => !geo.parentId && geo.countryCode && !taken.has(geo.countryCode),
  );
  const [country, setCountry] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = country || countries[0]?.countryCode || "";

  const create = async () => {
    setBusy(true);
    try {
      const created = await createWorkspace(chosen);
      await queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
      setNotice({
        text: `${created.name} has a workspace with the default roles and departments.`,
        error: false,
      });
      setCountry("");
    } catch (reason) {
      setNotice({ text: (reason as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      eyebrow="Workspaces"
      title="Countries on this installation"
      headingId="workspaces-heading"
      description="Each country plans in its own workspace, with its own roles, departments and people. As a platform admin you can open any of them."
      loading={choice.workspaces === null && !choice.error}
      error={choice.error}
    >
      <ul className={styles.list} aria-label="Workspaces">
        {(choice.workspaces ?? []).map((item) => (
          <li key={item.id} className={styles.row} aria-label={item.name}>
            <span className={styles.who}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.meta}>
                {item.country_code} ·{" "}
                {item.member_count === 1 ? "1 member" : `${item.member_count} members`}
              </span>
            </span>
            <span className={styles.actions}>
              <Button
                variant={choice.workspace?.id === item.id ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={choice.workspace?.id === item.id}
                onClick={() => choice.select(item.id)}
              >
                {choice.workspace?.id === item.id ? "Open" : "Switch to"}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {countries.length > 0 ? (
        <div className={styles.inline}>
          <InlineSelect
            label="Country"
            aria-label="Country for a new workspace"
            size="sm"
            value={chosen}
            onChange={setCountry}
            options={countries.map((geo) => ({
              value: geo.countryCode ?? "",
              label: geo.name,
            }))}
          />
          <Button variant="secondary" disabled={busy || !chosen} onClick={create}>
            Create workspace
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p
          className={styles.notice}
          data-error={notice.error}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}
    </SettingsCard>
  );
}
