"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { getStoredAuthSession } from "@/lib/authClient";
import type { GeographyRecord } from "@/lib/planningClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";

export type PlanningContext =
  | { status: "loading" }
  /** Nothing to show — signed in but not yet pointed at a place. */
  | { status: "none" }
  | {
      status: "ready";
      /** The area actually being planned for: the `?admin_unit=` override when
       * there is one, otherwise the dashboard's own geography. */
      placeName: string;
      levelLabel: string | null;
      /** Ancestors, broadest first, excluding `placeName` itself. */
      trail: string[];
      hazardLabel: string | null;
      outcomeLabel: string | null;
    };

// Mirrors the dashboard page's own fallback. Both default to the same code so
// the sidebar and the cards never disagree about which outcome is selected
// before the URL has been normalised to a catalog entry.
const DEFAULT_OUTCOME = "lbw";

/**
 * The planning context the shell should be showing, read from the same places
 * the dashboard reads it from: the URL for the place and the outcome, the
 * shared geography list for names, and the model catalog for the human labels.
 *
 * Deriving it here rather than accepting it as a prop is deliberate — every
 * page that renders the shell would otherwise have to thread the same four
 * values through, and the pages that do not know them (the learning hub,
 * settings) would silently show nothing.
 */
export function usePlanningContext(): PlanningContext {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const geographyId = dashboardGeographyId(pathname);
  const { geographies } = useGeographies();
  const { catalog } = useModelCatalog(geographyId);

  // Away from the dashboard the URL carries no place, but the session
  // remembers the last one the user chose, so the shell can still say what
  // they are planning for while they read a guide or edit settings.
  const rememberedGeography = geographyId
    ? null
    : (getStoredAuthSession()?.user.activeGeographyId ?? null);

  const adminUnit = searchParams.get("admin_unit");
  const outcome = searchParams.get("outcome") ?? DEFAULT_OUTCOME;

  return useMemo<PlanningContext>(() => {
    if (!geographyId && !rememberedGeography) return { status: "none" };
    if (!geographies) return { status: "loading" };

    const place = geographyId
      ? (resolveAdminUnit(geographies, geographyId, adminUnit) ??
        geographies.find((geo) => geo.id === geographyId))
      : geographies.find(
          (geo) =>
            geo.id === rememberedGeography ||
            trimPath(geo.path) === trimPath(rememberedGeography ?? ""),
        );
    if (!place) return { status: "none" };

    // Hold the whole block back until the labels are in rather than letting
    // the chip pop in underneath the place name a moment later.
    if (geographyId && !catalog) return { status: "loading" };

    const entry =
      catalog?.find((item) => item.outcome === outcome) ?? catalog?.[0] ?? null;

    return {
      status: "ready",
      placeName: place.name,
      levelLabel: place.levelLabel || null,
      trail: ancestorNames(geographies, place),
      hazardLabel: entry?.climate_hazard_label ?? null,
      outcomeLabel: entry?.outcome_label ?? null,
    };
  }, [adminUnit, catalog, geographies, geographyId, outcome, rememberedGeography]);
}

/** `/dashboard/<geo>` and `/dashboard/<geo>/runs/<id>` both describe the same
 * place; anything else carries no geography at all. */
function dashboardGeographyId(pathname: string | null): string | null {
  if (!pathname) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "dashboard" || !segments[1]) return null;
  return decodeURIComponent(segments[1]);
}

/** Accept `?admin_unit=` only when it really sits under the dashboard's
 * geography. A stale or hand-edited id would otherwise have the sidebar naming
 * a place none of the cards are showing. */
function resolveAdminUnit(
  geographies: GeographyRecord[],
  geographyId: string,
  adminUnit: string | null,
): GeographyRecord | undefined {
  if (!adminUnit) return undefined;
  const byId = new Map(geographies.map((geo) => [geo.id, geo]));
  const candidate = byId.get(adminUnit);
  let cursor = candidate;
  while (cursor?.parentId) {
    if (cursor.parentId === geographyId) return candidate;
    cursor = byId.get(cursor.parentId);
  }
  return undefined;
}

function ancestorNames(
  geographies: GeographyRecord[],
  place: GeographyRecord,
): string[] {
  const byId = new Map(geographies.map((geo) => [geo.id, geo]));
  const names: string[] = [];
  let cursor = place.parentId ? byId.get(place.parentId) : undefined;
  while (cursor) {
    names.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return names;
}

function trimPath(path: string): string {
  return path.replace(/\/+$/, "");
}
