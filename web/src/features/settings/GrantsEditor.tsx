"use client";

import { Button } from "@/components/Button";
import { InlineSelect } from "@/components/InlineSelect";
import { can, levelAt, type AccessHolder, type Level, type Module } from "@/lib/access";
import type { GeographyRecord } from "@/lib/planningClient";
import type { GrantInput, Role } from "@/lib/workspaceClient";

import styles from "./Access.module.css";

const RANK: Record<Level, number> = { read: 0, write: 1, manage: 2 };

/** Roles the person may give at a place: none above their own there. */
export function grantableRoles(
  user: AccessHolder,
  roles: Role[],
  place: string,
): Role[] {
  if (user.isPlatformAdmin) return roles;
  return roles.filter((role) =>
    (Object.entries(role.capabilities) as [Module, Level][]).every(
      ([module, level]) => {
        const held = levelAt(user, module, place);
        return held !== null && RANK[held] >= RANK[level];
      },
    ),
  );
}

type Props = {
  user: AccessHolder;
  roles: Role[];
  /** The workspace country's places. */
  places: GeographyRecord[];
  value: GrantInput[];
  onChange: (value: GrantInput[]) => void;
  /** People level the person needs at a place to grant there. */
  level: "write" | "manage";
};

/**
 * One row per grant: a role at a place, covering it and everything below.
 * Only places the person may grant at, and roles no higher than their own
 * there, are offered; the API checks the same.
 */
export function GrantsEditor({ user, roles, places, value, onChange, level }: Props) {
  const offered = places.filter((place) => can(user, "people", level, place.path));
  const pathOf = (id: string) => places.find((place) => place.id === id)?.path ?? "";
  const update = (index: number, change: Partial<GrantInput>) =>
    onChange(
      value.map((grant, at) => (at === index ? { ...grant, ...change } : grant)),
    );
  const add = () => {
    const free = offered.find(
      (place) => !value.some((grant) => grant.geography_id === place.id),
    );
    const role = free ? grantableRoles(user, roles, free.path).at(-1) : undefined;
    if (free && role) onChange([...value, { geography_id: free.id, role_id: role.id }]);
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Access</legend>
      {value.map((grant, index) => {
        const allowed = grantableRoles(user, roles, pathOf(grant.geography_id));
        return (
          <div
            key={index}
            className={styles.grant}
            role="group"
            aria-label={`Grant ${index + 1}`}
          >
            <InlineSelect
              aria-label="Role"
              size="sm"
              value={String(grant.role_id)}
              onChange={(next) => update(index, { role_id: Number(next) })}
              options={allowed.map((role) => ({
                value: String(role.id),
                label: role.name,
              }))}
            />
            <span className={styles.meta}>at</span>
            <InlineSelect
              aria-label="Place"
              size="sm"
              value={grant.geography_id}
              onChange={(next) => {
                const keep = grantableRoles(user, roles, pathOf(next)).some(
                  (role) => role.id === grant.role_id,
                );
                const fallback = grantableRoles(user, roles, pathOf(next)).at(-1);
                update(index, {
                  geography_id: next,
                  role_id: keep ? grant.role_id : (fallback?.id ?? grant.role_id),
                });
              }}
              options={offered
                .filter(
                  (place) =>
                    place.id === grant.geography_id ||
                    !value.some((other) => other.geography_id === place.id),
                )
                .map((place) => ({
                  value: place.id,
                  label: `${place.name} (${place.levelLabel})`,
                }))}
            />
            {value.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            ) : null}
          </div>
        );
      })}
      {offered.length > value.length ? (
        <div>
          <Button variant="secondary" size="sm" onClick={add}>
            Add a place
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/** "Planning lead · Madhya Pradesh, Viewer · India". */
export function grantSummary(grants: { role_name: string; place_name: string }[]) {
  return grants.map((grant) => `${grant.role_name} · ${grant.place_name}`).join(", ");
}
