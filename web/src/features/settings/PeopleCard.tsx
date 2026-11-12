"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SettingsCard } from "@/features/planning/SettingsCard";
import { can, levelInWorkspace, type AccessHolder } from "@/lib/access";
import { useGeographies } from "@/lib/useGeographies";
import {
  invite,
  listDepartments,
  listInvitations,
  listMembers,
  listRoles,
  resendInvitation,
  revokeInvitation,
  setMemberActive,
  updateMember,
  type GrantInput,
  type Invitation,
  type Member,
  type Workspace,
} from "@/lib/workspaceClient";

import styles from "./Access.module.css";
import { GrantsEditor, grantSummary, grantableRoles } from "./GrantsEditor";

type Props = { user: AccessHolder; workspace: Workspace };

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  disabled: "Disabled",
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

/**
 * Settings > People: the members whose places overlap yours, who invites
 * whom, and what each may do. Inviting needs people write; changing someone's
 * access or disabling them needs people manage over all their places.
 */
export function PeopleCard({ user, workspace }: Props) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ["workspace", workspace.id, "members"],
    queryFn: ({ signal }) => listMembers(workspace.id, signal),
  });
  const invitations = useQuery({
    queryKey: ["workspace", workspace.id, "invitations"],
    queryFn: ({ signal }) => listInvitations(workspace.id, signal),
  });
  const [dialog, setDialog] = useState<
    { kind: "invite" } | { kind: "edit"; member: Member } | null
  >(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const canInvite = levelInWorkspace(user, workspace.id, "people") !== "read";

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
    ]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      setNotice({ text: done, error: false });
    } catch (reason) {
      setNotice({ text: (reason as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const open = (invitations.data ?? []).filter((item) => item.status !== "accepted");
  return (
    <SettingsCard
      eyebrow="People"
      title={`People in ${workspace.name}`}
      headingId="people-heading"
      description="Each person holds a role at one or more places; a role covers the place and everything below it. You see the people whose places overlap yours."
      action={
        canInvite ? (
          <Button onClick={() => setDialog({ kind: "invite" })}>Invite someone</Button>
        ) : null
      }
      loading={members.isPending}
      error={members.error ? (members.error as Error).message : null}
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
      {members.data?.length === 0 ? (
        <p className={styles.note}>No one else plans in your places yet.</p>
      ) : null}
      <ul className={styles.list} aria-label="Members">
        {(members.data ?? []).map((member) => (
          <li
            key={member.user_id}
            className={styles.row}
            aria-label={member.display_name}
          >
            <span className={styles.avatar} aria-hidden="true">
              {member.display_name.charAt(0).toUpperCase()}
            </span>
            <span className={styles.who}>
              <span className={styles.name}>{member.display_name}</span>
              <span className={styles.meta}>
                {[member.email, grantSummary(member.grants)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className={styles.tags}>
              {member.departments.map((department) => (
                <span key={department.id} className={styles.tag}>
                  {department.name}
                </span>
              ))}
              <span className={styles.tag} data-tone={member.status}>
                {STATUS_LABELS[member.status]}
              </span>
            </span>
            {member.can_manage ? (
              <span className={styles.actions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDialog({ kind: "edit", member })}
                >
                  Edit access
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        setMemberActive(
                          workspace.id,
                          member.user_id,
                          member.status !== "active",
                        ),
                      member.status === "active"
                        ? `${member.display_name} is disabled and signed out.`
                        : `${member.display_name} is active again.`,
                    )
                  }
                >
                  {member.status === "active" ? "Disable" : "Enable"}
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {open.length > 0 ? (
        <>
          <h3 className={styles.section}>Invitations</h3>
          <ul className={styles.list} aria-label="Invitations">
            {open.map((item) => (
              <InvitationRow
                key={item.id}
                invitation={item}
                busy={busy}
                canAct={canInvite}
                onResend={() =>
                  run(
                    () => resendInvitation(workspace.id, item.id),
                    `Invitation sent again to ${item.email}.`,
                  )
                }
                onRevoke={() =>
                  run(
                    () => revokeInvitation(workspace.id, item.id),
                    `Invitation to ${item.email} revoked.`,
                  )
                }
              />
            ))}
          </ul>
        </>
      ) : null}

      {dialog?.kind === "invite" ? (
        <InviteDialog
          user={user}
          workspace={workspace}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null);
            await refresh();
            setNotice({ text, error: false });
          }}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EditMemberDialog
          user={user}
          workspace={workspace}
          member={dialog.member}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null);
            await refresh();
            setNotice({ text, error: false });
          }}
        />
      ) : null}
    </SettingsCard>
  );
}

function InvitationRow({
  invitation,
  busy,
  canAct,
  onResend,
  onRevoke,
}: {
  invitation: Invitation;
  busy: boolean;
  canAct: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const live = invitation.status === "pending" || invitation.status === "expired";
  return (
    <li className={styles.row} aria-label={invitation.email}>
      <span className={styles.who}>
        <span className={styles.name}>{invitation.email}</span>
        <span className={styles.meta}>
          {grantSummary(invitation.grants)}
          {invitation.invited_by ? ` · invited by ${invitation.invited_by}` : ""}
          {invitation.status === "pending"
            ? ` · expires ${new Date(invitation.expires_at).toLocaleDateString()}`
            : ""}
        </span>
      </span>
      <span className={styles.tags}>
        <span className={styles.tag} data-tone={invitation.status}>
          {STATUS_LABELS[invitation.status]}
        </span>
      </span>
      {canAct && live ? (
        <span className={styles.actions}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onResend}>
            Resend
          </Button>
          {invitation.status === "pending" ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onRevoke}>
              Revoke
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function useWorkspaceParts(workspace: Workspace) {
  const roles = useQuery({
    queryKey: ["workspace", workspace.id, "roles"],
    queryFn: ({ signal }) => listRoles(workspace.id, signal),
  });
  const departments = useQuery({
    queryKey: ["workspace", workspace.id, "departments"],
    queryFn: ({ signal }) => listDepartments(workspace.id, signal),
  });
  const { geographies } = useGeographies();
  const root = workspace.place_path ?? "";
  const places = (geographies ?? []).filter(
    (place) => place.path === root || place.path.startsWith(`${root}/`),
  );
  return {
    roles: roles.data?.items ?? [],
    departments: (departments.data?.items ?? []).filter((item) => !item.archived),
    places,
    ready: Boolean(roles.data && departments.data && geographies),
  };
}

function DepartmentPicker({
  departments,
  value,
  onChange,
}: {
  departments: { id: number; name: string }[];
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Departments</legend>
      <div className={styles.chips} role="group" aria-label="Departments">
        {departments.map((department) => (
          <button
            key={department.id}
            type="button"
            className={styles.chip}
            aria-pressed={value.includes(department.id)}
            onClick={() =>
              onChange(
                value.includes(department.id)
                  ? value.filter((id) => id !== department.id)
                  : [...value, department.id],
              )
            }
          >
            {department.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function InviteDialog({
  user,
  workspace,
  onClose,
  onDone,
}: {
  user: AccessHolder;
  workspace: Workspace;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const parts = useWorkspaceParts(workspace);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<GrantInput[] | null>(null);
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [newDepartment, setNewDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAddDepartment =
    levelInWorkspace(user, workspace.id, "departments") !== "read";

  // Start on the broadest place the person may invite to, at the lowest role.
  if (grants === null && parts.ready) {
    const first = parts.places.find(
      (place) =>
        can(user, "people", "write", place.path) &&
        grantableRoles(user, parts.roles, place.path).length > 0,
    );
    const role = first
      ? grantableRoles(user, parts.roles, first.path).at(-1)
      : undefined;
    setGrants(first && role ? [{ geography_id: first.id, role_id: role.id }] : []);
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!grants?.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invite(workspace.id, {
        email: email.trim(),
        name: name.trim(),
        grants,
        department_ids: departmentIds,
        new_departments: newDepartment.trim() ? [newDepartment.trim()] : [],
      });
      onDone(
        result.status === "accepted"
          ? `${result.email} already uses CHART: their access applies now.`
          : result.email_sent === false
            ? `Invitation saved, but the email to ${result.email} did not go out. Use Resend.`
            : `Invitation sent to ${result.email}.`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Invite someone"
      description="They get an email to sign in with a code. Their access applies at their first sign-in."
    >
      <form className={styles.form} onSubmit={submit} aria-label="Invite someone">
        <div className={styles.fields}>
          <label className={styles.field}>
            Full name
            <input
              className={styles.input}
              value={name}
              required
              maxLength={256}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Email
            <input
              className={styles.input}
              type="email"
              value={email}
              required
              maxLength={256}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>
        {grants ? (
          <GrantsEditor
            user={user}
            roles={parts.roles}
            places={parts.places}
            value={grants}
            onChange={setGrants}
            level="write"
          />
        ) : null}
        <DepartmentPicker
          departments={parts.departments}
          value={departmentIds}
          onChange={setDepartmentIds}
        />
        {canAddDepartment ? (
          <label className={styles.field}>
            Add a department for them (optional)
            <input
              className={styles.input}
              value={newDepartment}
              maxLength={120}
              placeholder="e.g. Women and child development"
              onChange={(event) => setNewDepartment(event.target.value)}
            />
          </label>
        ) : null}
        {error ? (
          <p className={styles.notice} data-error="true" role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.inline}>
          <Button
            type="submit"
            disabled={busy || !grants?.length || !name.trim() || !email.trim()}
          >
            Send invitation
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberDialog({
  user,
  workspace,
  member,
  onClose,
  onDone,
}: {
  user: AccessHolder;
  workspace: Workspace;
  member: Member;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const parts = useWorkspaceParts(workspace);
  const [grants, setGrants] = useState<GrantInput[]>(
    member.grants.map((grant) => ({
      geography_id: grant.geography_id,
      role_id: grant.role_id,
    })),
  );
  const [departmentIds, setDepartmentIds] = useState(
    member.departments.map((department) => department.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateMember(workspace.id, member.user_id, {
        grants,
        department_ids: departmentIds,
      });
      onDone(`${member.display_name}'s access is saved and applies now.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Edit ${member.display_name}'s access`}
    >
      <form className={styles.form} onSubmit={save} aria-label="Edit access">
        {parts.ready ? (
          <GrantsEditor
            user={user}
            roles={parts.roles}
            places={parts.places}
            value={grants}
            onChange={setGrants}
            level="manage"
          />
        ) : null}
        <DepartmentPicker
          departments={parts.departments}
          value={departmentIds}
          onChange={setDepartmentIds}
        />
        {error ? (
          <p className={styles.notice} data-error="true" role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.inline}>
          <Button type="submit" disabled={busy || grants.length === 0}>
            Save access
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
