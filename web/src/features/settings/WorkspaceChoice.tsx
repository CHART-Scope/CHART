"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";
import { listWorkspaces, type Workspace } from "@/lib/workspaceClient";

export const workspacesQueryKey = ["workspaces"] as const;

export type WorkspaceChoice = {
  workspaces: Workspace[] | null;
  workspace: Workspace | null;
  select: (id: string) => void;
  error: string | null;
};

/**
 * The workspace Settings shows: the one holding the active place, unless the
 * person picks another (a platform admin, or a member of several countries).
 */
export function useWorkspaceChoice(
  activeGeographyId: string | undefined,
): WorkspaceChoice {
  const query = useQuery({
    queryKey: workspacesQueryKey,
    queryFn: () => listWorkspaces(),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const workspaces = query.data ?? null;
  const active = activeGeographyId
    ? `/${activeGeographyId.split("/").filter(Boolean)[0]}`
    : null;
  const workspace =
    workspaces?.find((item) => item.id === picked) ??
    workspaces?.find((item) => item.place_path === active) ??
    workspaces?.[0] ??
    null;
  return {
    workspaces,
    workspace,
    select: setPicked,
    error: query.error ? (query.error as Error).message : null,
  };
}

/** A workspace switcher, shown only when there is a choice to make. */
export function WorkspacePicker({ choice }: { choice: WorkspaceChoice }) {
  if (!choice.workspaces || choice.workspaces.length < 2 || !choice.workspace)
    return null;
  return (
    <InlineSelect
      label="Workspace"
      aria-label="Workspace"
      size="sm"
      value={choice.workspace.id}
      onChange={choice.select}
      options={choice.workspaces.map((item) => ({ value: item.id, label: item.name }))}
    />
  );
}
