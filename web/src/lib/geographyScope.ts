import type { GeographyRecord } from "@/lib/planningClient";

/**
 * True when `scopes` grants the user access to `area`. A parent scope grants
 * its descendants; a child scope must not pull ancestors into scope — a
 * division-level user cannot navigate up to the state.
 */
export function isInScope(area: GeographyRecord, scopes: string[]): boolean {
  if (scopes.length === 0) return false;
  const areaPath = normalizeScope(area.path);
  return scopes.some((raw) => {
    const scope = normalizeScope(raw);
    if (!scope) return false;
    if (scope === area.id) return true;
    if (scope === areaPath) return true;
    return areaPath.startsWith(`${scope}/`);
  });
}

function normalizeScope(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") || !trimmed.includes("/") ? trimmed : `/${trimmed}`;
}
