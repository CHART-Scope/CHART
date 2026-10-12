import { isInScope } from "@/lib/geographyScope";
import type { GeographyRecord } from "@/lib/planningClient";

/** A "family" is the top-most in-scope root under which the user has at
 * least one model-backed area — e.g. `/india/madhya-pradesh` or `/kenya`.
 * Both the settings card and the inline context switcher list these
 * families (not every leaf) so the picker matches how a place actually
 * groups the installed models. */
export type Family = {
  root: GeographyRecord;
  areaCount: number;
  outcomeCount: number;
};

export function computeFamilies(geos: GeographyRecord[], scopes: string[]): Family[] {
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

/** Where planning for a family starts: the broadest place that still says
 * something, never a single county or division picked on the user's behalf.
 * From the family root it steps down only while there is exactly one branch
 * holding models, so India opens on Madhya Pradesh (its one modelled state)
 * and Kenya opens on Kenya; the dashboard then offers the areas beneath. */
export function defaultAreaForFamily(
  family: Family,
  geographies: readonly GeographyRecord[],
): GeographyRecord | null {
  const hasModel = (geo: GeographyRecord) => (geo.models?.length ?? 0) > 0;
  const within = (root: GeographyRecord, geo: GeographyRecord) => {
    const rootPath = root.path.replace(/\/+$/, "");
    return geo.path === root.path || geo.path.startsWith(`${rootPath}/`);
  };
  let place = family.root;
  while (!hasModel(place)) {
    const branches = geographies.filter(
      (geo) =>
        geo.parentId === place.id &&
        geographies.some((inner) => hasModel(inner) && within(geo, inner)),
    );
    if (branches.length !== 1) break;
    place = branches[0];
  }
  return place;
}

/** Match a geography id or family path against a family's subtree so
 * both `/india/madhya-pradesh` and `geo-in-madhya-pradesh-division-bhopal`
 * resolve to the same family.
 *
 * When ``geographies`` is supplied the candidate is first looked up as
 * an id and resolved to its ``path`` before the startsWith check —
 * without this, a leaf id like ``geo-in-madhya-pradesh-division-bhopal``
 * would only match a family via the exact-root shortcut, which no leaf
 * id ever satisfies. Callers on the dashboard hold geography ids from
 * the URL and MUST pass the list.
 */
export function familyContains(
  family: Family,
  candidate: string,
  geographies?: readonly GeographyRecord[],
): boolean {
  if (!candidate) return false;
  if (family.root.id === candidate) return true;
  const rootPath = family.root.path.replace(/\/+$/, "");
  const candidatePath = geographies?.find((geo) => geo.id === candidate)?.path;
  const cand = (candidatePath ?? candidate).replace(/\/+$/, "");
  return cand === rootPath || cand.startsWith(`${rootPath}/`);
}

export function familyLabel(root: GeographyRecord): string {
  const country = countryFromPath(root.path);
  if (!country || country === root.name) return root.name;
  return `${root.name}, ${country}`;
}

export function familyMeta(family: Family): string {
  const areas = `${family.areaCount} area${family.areaCount === 1 ? "" : "s"} with a model`;
  const outcomes = `${family.outcomeCount} outcome${family.outcomeCount === 1 ? "" : "s"}`;
  return `${areas} · ${outcomes}`;
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

function countryFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
