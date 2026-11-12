import type { GeographyRecord } from "@/lib/planningClient";

/**
 * True when the user may open `area`: a place they work on, one below it, or
 * one above it, which reads as context (docs/access-control.md). A place
 * beside theirs (a sibling district) stays out.
 */
export function isInScope(area: GeographyRecord, scopes: string[]): boolean {
  if (scopes.length === 0) return false;
  const areaPath = normalizeScope(area.path);
  return scopes.some((raw) => {
    const scope = normalizeScope(raw);
    if (!scope) return false;
    if (scope === area.id) return true;
    if (scope === "/" || scope === areaPath) return true;
    return areaPath.startsWith(`${scope}/`) || scope.startsWith(`${areaPath}/`);
  });
}

function normalizeScope(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") || !trimmed.includes("/") ? trimmed : `/${trimmed}`;
}
