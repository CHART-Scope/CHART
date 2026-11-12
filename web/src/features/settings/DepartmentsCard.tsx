"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SettingsCard } from "@/features/planning/SettingsCard";
import { levelInWorkspace, type AccessHolder } from "@/lib/access";
import {
  addDepartment,
  deleteDepartment,
  listDepartments,
  listResources,
  setMyDepartments,
  setOwnership,
  updateDepartment,
  type Department,
  type DepartmentList,
  type ResourceRef,
  type Workspace,
} from "@/lib/workspaceClient";

import styles from "./Access.module.css";

type Props = { user: AccessHolder; workspace: Workspace };

/**
 * Settings > Departments: rows the workspace manages, never a fixed list.
 * Everyone picks their own; departments write adds one; departments manage
 * renames, archives and deletes; a Workspace admin sets the data sources and
 * VRA indicator groups each owns, which narrows who may write them.
 */
export function DepartmentsCard({ user, workspace }: Props) {
  const queryClient = useQueryClient();
  const key = ["workspace", workspace.id, "departments"];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listDepartments(workspace.id, signal),
  });
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [owning, setOwning] = useState<Department | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const level = levelInWorkspace(user, workspace.id, "departments");
  const canAdd = level === "write" || level === "manage";
  const canManage = level === "manage";
  const canOwn = levelInWorkspace(user, workspace.id, "workspace") === "manage";
  const isMember = user.isPlatformAdmin
    ? user.workspaces.some((item) => item.workspaceId === workspace.id)
    : true;

  const run = async (change: () => Promise<DepartmentList>, done: string) => {
    setBusy(true);
    try {
      queryClient.setQueryData(key, await change());
      await queryClient.invalidateQueries({
        queryKey: ["workspace", workspace.id, "members"],
      });
      setNotice({ text: done, error: false });
      return true;
    } catch (reason) {
      setNotice({ text: (reason as Error).message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const mine = list.data?.mine ?? [];
  const toggle = (id: number) =>
    run(
      () =>
        setMyDepartments(
          workspace.id,
          mine.includes(id) ? mine.filter((item) => item !== id) : [...mine, id],
        ),
      "Your departments are saved.",
    );
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => addDepartment(workspace.id, name), `Added ${name.trim()}.`))
      setName("");
  };
  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    if (
      await run(
        () => updateDepartment(workspace.id, renaming.id, { name: renaming.name }),
        `Renamed to ${renaming.name.trim()}.`,
      )
    )
      setRenaming(null);
  };
  const active = (list.data?.items ?? []).filter((item) => !item.archived);

  return (
    <SettingsCard
      eyebrow="Departments"
      title={`Departments in ${workspace.name}`}
      headingId="departments-heading"
      description="The departments planning together. A department can own data sources and VRA indicator groups: only its members, and people who manage that area, may write them."
      loading={list.isPending}
      error={list.error ? (list.error as Error).message : null}
    >
      {notice ? (
        <p
          className={styles.notice}
          data-error={notice.error}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}
      {isMember && active.length > 0 ? (
        <>
          <h3 className={styles.section}>Mine</h3>
          <div className={styles.chips} role="group" aria-label="My departments">
            {active.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.chip}
                aria-pressed={mine.includes(item.id)}
                disabled={busy}
                onClick={() => toggle(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <h3 className={styles.section}>All departments</h3>
      <ul className={styles.list} aria-label="Departments">
        {(list.data?.items ?? []).map((item) => (
          <li key={item.id} className={styles.row} aria-label={item.name}>
            <span className={styles.who}>
              {renaming?.id === item.id ? (
                <form
                  className={styles.inline}
                  onSubmit={rename}
                  aria-label={`Rename ${item.name}`}
                >
                  <label className={styles.field}>
                    New name
                    <input
                      className={styles.input}
                      value={renaming.name}
                      maxLength={120}
                      autoFocus
                      onChange={(event) =>
                        setRenaming({ id: item.id, name: event.target.value })
                      }
                    />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || renaming.name.trim().length < 2}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.meta}>
                    {item.member_count === 1
                      ? "1 member"
                      : `${item.member_count} members`}
                    {item.owns.length > 0
                      ? ` · owns ${item.owns.map((resource) => resource.key).join(", ")}`
                      : ""}
                  </span>
                </>
              )}
            </span>
            {item.archived ? (
              <span className={styles.tags}>
                <span className={styles.tag} data-tone="archived">
                  Archived
                </span>
              </span>
            ) : null}
            {renaming?.id !== item.id && (canManage || canOwn) ? (
              <span className={styles.actions}>
                {canOwn && !item.archived ? (
                  <Button variant="secondary" size="sm" onClick={() => setOwning(item)}>
                    Ownership
                  </Button>
                ) : null}
                {canManage ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming({ id: item.id, name: item.name })}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            updateDepartment(workspace.id, item.id, {
                              archived: !item.archived,
                            }),
                          item.archived
                            ? `${item.name} is restored.`
                            : `${item.name} is archived.`,
                        )
                      }
                    >
                      {item.archived ? "Restore" : "Archive"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => deleteDepartment(workspace.id, item.id),
                          `${item.name} is deleted.`,
                        )
                      }
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {canAdd ? (
        <form className={styles.inline} onSubmit={add} aria-label="Add a department">
          <label className={styles.field}>
            Add a department
            <input
              className={styles.input}
              value={name}
              maxLength={120}
              placeholder="e.g. Women and child development"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || name.trim().length < 2}
          >
            Add
          </Button>
        </form>
      ) : null}

      {owning ? (
        <OwnershipDialog
          workspace={workspace}
          department={owning}
          onClose={() => setOwning(null)}
          onSave={async (resources) => {
            if (
              await run(
                () => setOwnership(workspace.id, owning.id, resources),
                `${owning.name}'s ownership is saved.`,
              )
            )
              setOwning(null);
          }}
        />
      ) : null}
    </SettingsCard>
  );
}

function OwnershipDialog({
  workspace,
  department,
  onClose,
  onSave,
}: {
  workspace: Workspace;
  department: Department;
  onClose: () => void;
  onSave: (resources: ResourceRef[]) => void;
}) {
  const options = useQuery({
    queryKey: ["workspace", workspace.id, "resources"],
    queryFn: ({ signal }) => listResources(workspace.id, signal),
  });
  const [picked, setPicked] = useState<string[]>(
    department.owns.map((item) => `${item.kind}:${item.key}`),
  );
  const toggle = (id: string) =>
    setPicked(
      picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id],
    );
  const groups = [
    { kind: "data_source", label: "Data sources" },
    { kind: "vra_indicator_group", label: "VRA indicator groups" },
  ] as const;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`What ${department.name} owns`}
      description="Writes to an owned resource need one of its departments, unless the person manages that area. Resources nobody owns stay open to anyone who may write."
    >
      <div className={styles.form}>
        {groups.map((group) => (
          <fieldset key={group.kind} className={styles.fieldset}>
            <legend className={styles.legend}>{group.label}</legend>
            <div className={styles.chips} role="group" aria-label={group.label}>
              {(options.data ?? [])
                .filter((item) => item.kind === group.kind)
                .map((item) => {
                  const id = `${item.kind}:${item.key}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={styles.chip}
                      aria-pressed={picked.includes(id)}
                      onClick={() => toggle(id)}
                    >
                      {item.name}
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}
        <div className={styles.inline}>
          <Button
            onClick={() =>
              onSave(
                picked.map((id) => {
                  const [kind, ...rest] = id.split(":");
                  return { kind: kind as ResourceRef["kind"], key: rest.join(":") };
                }),
              )
            }
          >
            Save ownership
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
