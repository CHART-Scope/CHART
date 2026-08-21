"use client";

import { useEffect, useMemo, useState } from "react";

import { rememberActiveGeography, type AuthSession } from "@/lib/authClient";
import { isInScope } from "@/lib/geographyScope";
import { listGeographies, type GeographyRecord } from "@/lib/planningClient";

import styles from "./GeographyContextCard.module.css";

type Family = {
  root: GeographyRecord;
  areaCount: number;
  outcomeCount: number;
};

export function GeographyContextCard({ session }: { session: AuthSession }) {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [current, setCurrent] = useState<string>(session.user.activeGeographyId ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (!cancelled)
          setFamilies(computeFamilies(records, session.user.geographyScopes));
      })
      .catch(() => {
        if (!cancelled) setFamilies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session.user.geographyScopes]);

  const activeFamily = useMemo(
    () =>
      (families ?? []).find(
        (family) =>
          pathContains(family.root.path, current) || family.root.id === current,
      ) ?? null,
    [families, current],
  );

  function handleChange(value: string) {
    const family = (families ?? []).find((f) => f.root.path === value);
    if (!family || family.root.path === current) return;
    rememberActiveGeography(family.root.path);
    setCurrent(family.root.path);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <p className={styles.title}>Context</p>
        <p className={styles.subtitle}>
          The place CHART plans and predicts for. Only areas we have installed models
          for appear here.
        </p>
      </div>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={activeFamily?.root.path ?? ""}
          onChange={(event) => handleChange(event.currentTarget.value)}
          disabled={families === null || families.length === 0}
          aria-label="Active context"
        >
          {families === null ? (
            <option value="">Loading…</option>
          ) : families.length === 0 ? (
            <option value="">No installed models for your scope</option>
          ) : (
            <>
              {activeFamily === null ? (
                <option value="" disabled>
                  Choose a context
                </option>
              ) : null}
              {families.map((family) => (
                <option key={family.root.id} value={family.root.path}>
                  {familyLabel(family.root)}
                </option>
              ))}
            </>
          )}
        </select>
        <span
          className={saved ? styles.savedShown : styles.savedHidden}
          role="status"
          aria-live="polite"
        >
          Saved · applies on next Plan / Dashboard visit
        </span>
      </div>
      {activeFamily ? <p className={styles.meta}>{familyMeta(activeFamily)}</p> : null}
    </section>
  );
}

function computeFamilies(geos: GeographyRecord[], scopes: string[]): Family[] {
  const byId = new Map(geos.map((geo) => [geo.id, geo]));
  const rootPathToFamily = new Map<string, Family>();
  for (const geo of geos) {
    if ((geo.models?.length ?? 0) === 0) continue;
    if (!isInScope(geo, scopes)) continue;
    const root = climbToInScopeRoot(geo, byId, scopes);
    if (!rootPathToFamily.has(root.path)) {
      rootPathToFamily.set(root.path, buildFamilyStats(root, geos));
    }
  }
  return Array.from(rootPathToFamily.values()).sort((a, b) =>
    a.root.name.localeCompare(b.root.name),
  );
}

function climbToInScopeRoot(
  geo: GeographyRecord,
  byId: Map<string, GeographyRecord>,
  scopes: string[],
): GeographyRecord {
  let current = geo;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    if (!isInScope(parent, scopes)) break;
    current = parent;
  }
  return current;
}

function buildFamilyStats(root: GeographyRecord, all: GeographyRecord[]): Family {
  const rootPath = root.path.replace(/\/+$/, "");
  const inSubtree = all.filter(
    (geo) => geo.path === root.path || geo.path.startsWith(`${rootPath}/`),
  );
  const withModels = inSubtree.filter((geo) => (geo.models?.length ?? 0) > 0);
  const outcomes = new Set(
    withModels.flatMap((geo) => geo.models?.map((model) => model.outcome) ?? []),
  );
  return {
    root,
    areaCount: withModels.length,
    outcomeCount: outcomes.size,
  };
}

function familyLabel(root: GeographyRecord): string {
  const country = countryFromPath(root.path);
  if (!country || country === root.name) return root.name;
  return `${root.name}, ${country}`;
}

function familyMeta(family: Family): string {
  const areas = `${family.areaCount} area${family.areaCount === 1 ? "" : "s"} with a model`;
  const outcomes = `${family.outcomeCount} outcome${family.outcomeCount === 1 ? "" : "s"}`;
  return `${areas} · ${outcomes}`;
}

function pathContains(rootPath: string, candidate: string): boolean {
  if (!candidate) return false;
  const root = rootPath.replace(/\/+$/, "");
  const cand = candidate.replace(/\/+$/, "");
  return cand === root || cand.startsWith(`${root}/`);
}

function countryFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
