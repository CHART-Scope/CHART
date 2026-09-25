"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { AppShell } from "@/components/AppShell";
import { InlineSelect } from "@/components/InlineSelect";
import { IconSprite } from "@/components/Icon";
import { ScienceVideoPlaceholder } from "@/features/dashboard/ScienceVideoPlaceholder";
import { RequireAuth } from "@/features/auth/RequireAuth";
import {
  DashboardHeader,
  HeatLbwLinkPanel,
  RecommendedActionsPanel,
  RiskProtectionPanel,
  SpatialRiskMap,
  DashboardSkeleton,
  lastCompleteMonth,
} from "@/features/dashboard";
import { DashboardContextBar } from "@/features/dashboard";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";
import { type GeographyRecord } from "@/lib/planningClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string; outcome?: string; month?: string }>;
};

// Repository-native hazard label the /solutions taxonomy is keyed on. The
// dashboard shows "Extreme heat" but the solution repository (and the
// Airtable it mirrors) uses "Increased temperature".
const DEPLOYED_HAZARD_REPOSITORY_KEY = "Increased temperature";

export default function DashboardGeoPage(props: PageProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const adminUnit = searchParams.admin_unit ?? null;
  const outcome = searchParams.outcome ?? "lbw";
  // The selected month lives in the URL beside admin_unit and outcome so a
  // reload, a back button or a shared link all land on the same month. Held
  // in component state it was lost on every refresh.
  const month = searchParams.month ?? null;

  return (
    <RequireAuth fallback={<DashboardSkeleton />}>
      {(session) => (
        <AuthorizedDashboard
          session={session}
          geographyId={params.geo}
          adminUnit={adminUnit}
          outcome={outcome}
          month={month}
        />
      )}
    </RequireAuth>
  );
}

function AuthorizedDashboard({
  session,
  geographyId,
  adminUnit,
  outcome,
  month,
}: {
  session: AuthSession;
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
  month: string | null;
}) {
  const router = useRouter();
  const [mapRefresh, setMapRefresh] = useState(0);
  // Geography changes inside the current map frame (state ↔ division,
  // country ↔ county) should feel like direct manipulation. The URL remains
  // the durable source of truth, but waiting for a Next navigation before
  // moving the outline made the map feel sluggish even though no new map data
  // was needed.
  const [optimisticAdminUnit, setOptimisticAdminUnit] = useState<
    string | null | undefined
  >(undefined);
  const refreshMap = useCallback(() => setMapRefresh((value) => value + 1), []);
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string, options = { scroll: false }) => {
      startTransition(() => router.push(href, options));
    },
    [router],
  );
  // Both lists come from module-scoped caches rather than a fetch per mount.
  // The page previously called listGeographies() and listModelCatalog()
  // directly, so every location switch re-fetched values that had not
  // changed - and the context bar, sidebar and cards all went blank while it
  // happened, even though the answer was already in memory.
  const { geographies: cachedGeographies } = useGeographies();
  // Null means "still loading" in the hook; the page treats an unknown list
  // the same as an empty one, and the skeleton covers the wait.
  const geographies = cachedGeographies ?? [];
  const { catalog: cachedCatalog } = useModelCatalog(geographyId);
  const catalog = cachedCatalog ?? [];

  const hasAccess = useMemo(
    () => session.user.roles.length > 0 && session.user.geographyScopes.length > 0,
    [session.user.roles, session.user.geographyScopes],
  );

  useEffect(() => {
    if (!hasAccess) router.replace("/access-pending");
  }, [hasAccess, router]);

  const effectiveAdminUnit = useMemo(() => {
    if (!adminUnit) return null;
    const candidate = geographies.find((geo) => geo.id === adminUnit);
    return candidate?.parentId === geographyId &&
      candidate.models?.some((model) => model.outcome === outcome)
      ? adminUnit
      : null;
  }, [adminUnit, geographies, geographyId, outcome]);

  useEffect(() => {
    setOptimisticAdminUnit(undefined);
  }, [adminUnit, geographyId]);

  const displayedAdminUnit =
    optimisticAdminUnit === undefined ? effectiveAdminUnit : optimisticAdminUnit;

  useEffect(() => {
    if (!adminUnit || geographies.length === 0 || effectiveAdminUnit) return;
    router.replace(
      `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(outcome)}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
      { scroll: false },
    );
  }, [
    adminUnit,
    effectiveAdminUnit,
    geographies.length,
    geographyId,
    outcome,
    month,
    router,
  ]);

  // Landing directly on a leaf geography (division / county with no children of
  // its own) reuses the parent's dashboard scope so the sibling switcher is
  // populated: Bhopal → MP?admin_unit=Bhopal, Kajiado → Kenya?admin_unit=Kajiado.
  // Non-leaf places (a state that owns divisions, a country that owns counties)
  // stay put — they already are the scope.
  useEffect(() => {
    if (geographies.length === 0 || adminUnit) return;
    const current = geographies.find((geo) => geo.id === geographyId);
    if (!current?.parentId) return;
    const hasChildren = geographies.some((geo) => geo.parentId === current.id);
    if (hasChildren) return;
    const parent = geographies.find((geo) => geo.id === current.parentId);
    if (!parent) return;
    router.replace(
      `/dashboard/${encodeURIComponent(parent.id)}?admin_unit=${encodeURIComponent(geographyId)}&outcome=${encodeURIComponent(outcome)}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
      { scroll: false },
    );
  }, [geographies, geographyId, adminUnit, outcome, month, router]);

  const currentGeography = geographies.find((geo) => geo.id === geographyId);
  const effectiveGeography =
    geographies.find((geo) => geo.id === effectiveAdminUnit) ?? currentGeography;
  const country = currentGeography ? countryFromPath(currentGeography.path) : "";
  // The place trail, broadest first, walked from the area actually selected
  // rather than from the page's geography. Built from the ancestry so it
  // follows the sub-area picker: choosing a division must move the
  // breadcrumb, and a country-level view must not render its own name twice.
  const placeTrail = useMemo(() => {
    const byId = new Map(geographies.map((geo) => [geo.id, geo]));
    const names: string[] = [];
    let cursor = byId.get(effectiveAdminUnit ?? geographyId);
    while (cursor) {
      names.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return names.length > 0 ? names : [country || geographyId];
  }, [geographies, effectiveAdminUnit, geographyId, country]);
  const stateLabel = currentGeography
    ? `${currentGeography.name} (${currentGeography.levelLabel})`
    : geographyId;
  const selectedCatalog = catalog.find((entry) => entry.outcome === outcome);
  const outcomeLabel = selectedCatalog?.outcome_label ?? humanizeCode(outcome);
  const selectedModel = effectiveGeography?.models?.find(
    (model) => model.outcome === outcome,
  );

  const districts = useMemo(() => {
    if (!currentGeography) return [];
    return geographies
      .filter((geo) => geo.parentId === currentGeography.id)
      .filter((geo) => geo.models?.some((model) => model.outcome === outcome))
      .filter((geo) => canUseArea(geo, session.user.geographyScopes))
      .map((geo) => ({
        code: geo.id,
        name: cleanDisplayName(geo.name, geo.levelLabel),
        levelLabel: geo.levelLabel,
      }));
  }, [currentGeography, geographies, outcome, session.user.geographyScopes]);

  useEffect(() => {
    if (catalog.length === 0 || selectedCatalog) return;
    router.replace(
      `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(catalog[0].outcome)}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
    );
  }, [catalog, geographyId, month, router, selectedCatalog]);

  useEffect(() => {
    if (
      !selectedCatalog ||
      selectedModel ||
      effectiveAdminUnit ||
      !currentGeography?.parentId ||
      districts.length === 0
    ) {
      return;
    }
    router.replace(
      `/dashboard/${encodeURIComponent(geographyId)}?admin_unit=${encodeURIComponent(districts[0].code)}&outcome=${encodeURIComponent(outcome)}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
      { scroll: false },
    );
  }, [
    districts,
    effectiveAdminUnit,
    geographyId,
    outcome,
    month,
    router,
    selectedCatalog,
    selectedModel,
    currentGeography?.parentId,
  ]);

  const nav = appNavForRoles(session.user.roles);
  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) navigate(target);
    },
    [navigate],
  );

  const handleAdminUnitChange = useCallback(
    (code: string | null) => {
      setOptimisticAdminUnit(code);
      const target =
        code === null
          ? `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(outcome)}`
          : `/dashboard/${encodeURIComponent(geographyId)}?admin_unit=${encodeURIComponent(code)}&outcome=${encodeURIComponent(outcome)}`;
      navigate(month ? `${target}&month=${encodeURIComponent(month)}` : target, {
        scroll: false,
      });
    },
    [geographyId, outcome, month, navigate],
  );
  const handleOutcomeChange = useCallback(
    (nextOutcome: string) => {
      navigate(
        `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(nextOutcome)}${effectiveAdminUnit ? `&admin_unit=${encodeURIComponent(effectiveAdminUnit)}` : ""}${month ? `&month=${encodeURIComponent(month)}` : ""}`,
        { scroll: false },
      );
    },
    [geographyId, effectiveAdminUnit, month, navigate],
  );

  const outcomeControl = (
    <InlineSelect
      menu
      aria-label="Health outcome"
      value={outcome}
      onChange={handleOutcomeChange}
      options={
        catalog.length === 0
          ? [{ value: outcome, label: outcomeLabel }]
          : catalog.map((entry) => ({
              value: entry.outcome,
              label: `${entry.outcome_label}${entry.batch_status === "blocked_pending_modeller_confirmation" ? " — not ready" : ""}`,
            }))
      }
    />
  );
  const placeControl = (
    <InlineSelect
      menu
      aria-label="Risk estimate area"
      value={displayedAdminUnit ?? ""}
      onChange={(value) => handleAdminUnitChange(value || null)}
      options={[
        { value: "", label: stateLabel },
        ...districts.map((area) => ({ value: area.code, label: area.name })),
      ]}
    />
  );

  if (!hasAccess) return null;

  return (
    <>
      <IconSprite />
      <AppShell
        nav={nav}
        activeNav="planning"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <main className={styles.page} aria-busy={isPending}>
          {isPending && (
            <div className={styles.updating} role="status">
              Updating dashboard…
            </div>
          )}
          <DashboardContextBar
            geographyScopes={session.user.geographyScopes}
            geographyId={geographyId}
            adminUnit={adminUnit ?? null}
            outcome={outcome}
            catalog={catalog}
            onNavigate={({
              geographyId: nextGeo,
              adminUnit: nextAdmin,
              outcome: nextOutcome,
            }) => {
              if (nextGeo === geographyId) setOptimisticAdminUnit(nextAdmin ?? null);
              const params = new URLSearchParams();
              if (nextAdmin) params.set("admin_unit", nextAdmin);
              if (nextOutcome) params.set("outcome", nextOutcome);
              if (month) params.set("month", month);
              const query = params.toString() ? `?${params.toString()}` : "";
              navigate(`/dashboard/${encodeURIComponent(nextGeo)}${query}`);
            }}
          />
          <DashboardHeader
            trail={placeTrail}
            hazardLabel={selectedCatalog?.climate_hazard_label ?? "Climate hazard"}
            healthDomainLabel={
              selectedCatalog?.health_domain_label ?? "Climate-sensitive health"
            }
          />

          {selectedCatalog?.visualization_type === "odds_ratio_icon_array" ||
          !selectedCatalog?.visualization_type ? (
            <div className={styles.grid}>
              <aside className={styles.learning}>
                <ScienceVideoPlaceholder />
                <RiskProtectionPanel
                  outcomeLabel={outcomeLabel}
                  outcomeControl={outcomeControl}
                  contextFigure={
                    selectedCatalog?.visualization_context_figure ?? "pregnant-woman"
                  }
                  description={selectedCatalog?.risk_description}
                />
              </aside>
              <HeatLbwLinkPanel
                onPredictionReady={refreshMap}
                placeLabel={effectiveGeography?.name ?? stateLabel}
                modelAreaName={selectedModel?.modelAreaName ?? null}
                outcome={outcome}
                outcomeLabel={outcomeLabel}
                outcomeControl={outcomeControl}
                placeControl={placeControl}
                figure={
                  outcome === "lbw"
                    ? "newborn"
                    : (selectedCatalog?.visualization_figure ?? "baby")
                }
                batchEnabled={
                  selectedCatalog?.batch_status !==
                  "blocked_pending_modeller_confirmation"
                }
                geographyId={effectiveAdminUnit ?? geographyId}
                month={month}
                onMonthChange={(nextMonth) => {
                  const params = new URLSearchParams();
                  if (adminUnit) params.set("admin_unit", adminUnit);
                  if (outcome) params.set("outcome", outcome);
                  if (nextMonth) params.set("month", nextMonth);
                  // push, not replace: choosing a month is a step the reader
                  // took, and replacing the entry meant Back left the
                  // dashboard entirely instead of walking the months visited.
                  navigate(
                    `/dashboard/${encodeURIComponent(geographyId)}?${params.toString()}`,
                    { scroll: false },
                  );
                }}
                accessToken={selectedModel ? session.accessToken : undefined}
                canPrepare={
                  Boolean(selectedModel) &&
                  selectedCatalog?.batch_status !==
                    "blocked_pending_modeller_confirmation" &&
                  session.user.roles.some((role) =>
                    [
                      "chart_admin",
                      "health_planning_lead",
                      "cross_sector_planning_lead",
                      "health_implementation_officer",
                      "cross_sector_implementation_officer",
                    ].includes(role),
                  )
                }
              >
                <SpatialRiskMap
                  dataRefreshKey={mapRefresh}
                  embedded
                  geographyId={geographyId}
                  accessToken={session.accessToken}
                  month={month ?? lastCompleteMonth()}
                  outcome={outcome}
                  // Falls back to the place the dashboard is on. The map now
                  // frames a leaf selection on its siblings, so without this
                  // nothing is picked out among them when you land on a
                  // division directly rather than choosing a sub-area.
                  selectedGeographyId={displayedAdminUnit ?? geographyId}
                  canPrepare={
                    selectedCatalog?.batch_status !==
                      "blocked_pending_modeller_confirmation" &&
                    session.user.roles.some((role) =>
                      [
                        "chart_admin",
                        "health_planning_lead",
                        "cross_sector_planning_lead",
                        "health_implementation_officer",
                        "cross_sector_implementation_officer",
                      ].includes(role),
                    )
                  }
                  onSelect={(nextGeography: string) => {
                    setOptimisticAdminUnit(nextGeography);
                    const params = new URLSearchParams();
                    params.set("admin_unit", nextGeography);
                    if (outcome) params.set("outcome", outcome);
                    if (month) params.set("month", month);
                    navigate(
                      `/dashboard/${encodeURIComponent(geographyId)}?${params.toString()}`,
                    );
                  }}
                />
              </HeatLbwLinkPanel>
            </div>
          ) : (
            <section className={styles.unsupportedVisualization} role="status">
              This model is available, but its dashboard visualization is not yet
              installed.
            </section>
          )}

          <RecommendedActionsPanel
            hazard={DEPLOYED_HAZARD_REPOSITORY_KEY}
            hazardLabel={selectedCatalog?.climate_hazard_label ?? "Climate hazard"}
          />
        </main>
      </AppShell>
    </>
  );
}

function countryFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  return parts[0]
    .split("-")
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(" ");
}

function humanizeCode(value: string): string {
  if (!value) return "Health outcome";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function canUseArea(area: GeographyRecord, scopes: string[]): boolean {
  const path = area.path.replace(/\/+$/, "");
  return scopes.some((raw) => {
    const scope = raw.trim().replace(/\/+$/, "");
    return scope === area.id || scope === path || path.startsWith(`${scope}/`);
  });
}

/**
 * The geography seed stores division names as "Bhopal Division". The
 * mockup shows just "Bhopal", so strip a trailing level-label suffix
 * when it is present, but leave state-level names ("Madhya Pradesh")
 * alone.
 */
function cleanDisplayName(name: string, levelLabel: string): string {
  const suffix = ` ${levelLabel}`;
  if (levelLabel && name.endsWith(suffix)) {
    return name.slice(0, -suffix.length);
  }
  return name;
}
