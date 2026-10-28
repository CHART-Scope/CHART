"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { ScienceVideo } from "@/features/dashboard/ScienceVideo";
import { useSession } from "@/features/auth/WorkspaceSession";
import {
  HeatLbwLinkPanel,
  HeatOutlookPanel,
  RecommendedActionsPanel,
  RiskProtectionPanel,
  SpatialRiskMap,
} from "@/features/dashboard";
import { DashboardContextBar } from "@/features/dashboard";
import { exposedPopulationFigure, iconArrayFigure } from "@/features/dashboard/figures";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";
import { type GeographyRecord } from "@/lib/planningClient";
import { type OutlookChoices } from "@/features/dashboard/HeatOutlookPanel";
import { resolveMonthlyRiskMonth } from "@/features/dashboard/HeatLbwLinkPanel";

import {
  fetchOutlookCapabilities,
  type OutlookCapabilities,
} from "@/lib/heatOutlookClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string; outcome?: string; month?: string }>;
};

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
    <Dashboard
      geographyId={params.geo}
      adminUnit={adminUnit}
      outcome={outcome}
      month={month}
    />
  );
}

function Dashboard({
  geographyId,
  adminUnit,
  outcome,
  month,
}: {
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
  month: string | null;
}) {
  // The workspace layout restores the session and sends an account without a
  // planning area to /access-pending before this renders.
  const session = useSession();
  const router = useRouter();
  const [mapRefresh, setMapRefresh] = useState(0);
  const [outlookSelection, setOutlookSelection] = useState<{
    key: string;
    value: OutlookChoices;
  } | null>(null);
  const outlookSelectionKey = `${geographyId}:${outcome}`;
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

  // A country whose areas hold their own sub-areas (India: one state, ten
  // divisions) has no useful country view: open the state instead, keeping
  // any division that was asked for.
  useEffect(() => {
    if (geographies.length === 0) return;
    const current = geographies.find((geo) => geo.id === geographyId);
    if (!current || current.parentId) return;
    const hasModel = (geo: GeographyRecord) => (geo.models?.length ?? 0) > 0;
    const areas = geographies.filter(
      (geo) => geo.parentId === current.id && hasModel(geo),
    );
    const deeper = areas.filter((area) =>
      geographies.some((geo) => geo.parentId === area.id && hasModel(geo)),
    );
    if (hasModel(current) || deeper.length === 0 || deeper.length !== areas.length)
      return;
    const asked = geographies.find((geo) => geo.id === adminUnit);
    const state =
      deeper.find((area) => area.id === adminUnit || area.id === asked?.parentId) ??
      deeper[0];
    const params = new URLSearchParams();
    if (asked && asked.parentId === state.id) params.set("admin_unit", asked.id);
    params.set("outcome", outcome);
    if (month) params.set("month", month);
    router.replace(`/dashboard/${encodeURIComponent(state.id)}?${params}`, {
      scroll: false,
    });
  }, [geographies, geographyId, adminUnit, outcome, month, router]);

  const currentGeography = geographies.find((geo) => geo.id === geographyId);
  const selectedGeographyId = displayedAdminUnit ?? geographyId;
  const effectiveGeography =
    geographies.find((geo) => geo.id === selectedGeographyId) ?? currentGeography;
  const [capabilities, setCapabilities] = useState<{
    key: string;
    data?: OutlookCapabilities;
    error?: boolean;
  } | null>(null);
  const capabilityKey = `${selectedGeographyId}:${outcome}`;
  useEffect(() => {
    const controller = new AbortController();
    fetchOutlookCapabilities(
      selectedGeographyId,
      session.accessToken,
      outcome,
      controller.signal,
    )
      .then((data) => setCapabilities({ key: capabilityKey, data }))
      .catch(() => {
        if (!controller.signal.aborted)
          setCapabilities({ key: capabilityKey, error: true });
      });
    return () => controller.abort();
  }, [selectedGeographyId, session.accessToken, outcome, capabilityKey]);
  const resolvedCapabilities =
    capabilities?.key === capabilityKey ? capabilities : null;
  const publishedOutlook = resolvedCapabilities?.data?.published ?? false;
  const useOutlookPanel =
    publishedOutlook || Boolean(resolvedCapabilities?.data?.observed?.source);
  const stateLabel = currentGeography
    ? `${currentGeography.name} (${currentGeography.levelLabel})`
    : geographyId;
  const selectedCatalog = catalog.find((entry) => entry.outcome === outcome);
  const outcomeLabel = selectedCatalog?.outcome_label ?? humanizeCode(outcome);
  const batchEnabled =
    resolvedCapabilities?.data?.observed?.source === "monthly"
      ? resolvedCapabilities.data.observed.batch_enabled
      : !["blocked_pending_modeller_confirmation", "projection_only"].includes(
          selectedCatalog?.batch_status ?? "",
        );
  const selectedModel = effectiveGeography?.models?.find(
    (model) => model.outcome === outcome,
  );
  const observedModelAvailable = resolvedCapabilities?.data?.observed
    ? resolvedCapabilities.data.observed.source === "monthly" &&
      resolvedCapabilities.data.data_modes.includes("observed")
    : Boolean(selectedModel);

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

  const observedMonth = resolveMonthlyRiskMonth(month);
  const observedPanel = (
    <HeatLbwLinkPanel
      embedded={useOutlookPanel}
      onPredictionReady={refreshMap}
      placeLabel={effectiveGeography?.name ?? stateLabel}
      modelAreaName={
        resolvedCapabilities?.data?.observed?.model_area_name ??
        selectedModel?.modelAreaName ??
        null
      }
      outcome={outcome}
      outcomeLabel={outcomeLabel}
      figure={iconArrayFigure(outcome)}
      batchEnabled={batchEnabled}
      geographyId={selectedGeographyId}
      month={observedMonth}
      onMonthChange={(nextMonth) => {
        const params = new URLSearchParams();
        if (adminUnit) params.set("admin_unit", adminUnit);
        if (outcome) params.set("outcome", outcome);
        if (nextMonth) params.set("month", nextMonth);
        // push, not replace: choosing a month is a step the reader
        // took, and replacing the entry meant Back left the
        // dashboard entirely instead of walking the months visited.
        navigate(`/dashboard/${encodeURIComponent(geographyId)}?${params.toString()}`, {
          scroll: false,
        });
      }}
      accessToken={observedModelAvailable ? session.accessToken : undefined}
      canPrepare={
        observedModelAvailable &&
        batchEnabled &&
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
        month={observedMonth}
        outcome={outcome}
        // Falls back to the place the dashboard is on. The map now
        // frames a leaf selection on its siblings, so without this
        // nothing is picked out among them when you land on a
        // division directly rather than choosing a sub-area.
        selectedGeographyId={displayedAdminUnit ?? geographyId}
        canPrepare={
          observedModelAvailable &&
          batchEnabled &&
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
          // Clicking the selected division again returns to the whole
          // state, where the state has an estimate of its own.
          const wholeState =
            nextGeography === displayedAdminUnit &&
            currentGeography?.models?.some((model) => model.outcome === outcome);
          setOptimisticAdminUnit(wholeState ? null : nextGeography);
          const params = new URLSearchParams();
          if (!wholeState) params.set("admin_unit", nextGeography);
          if (outcome) params.set("outcome", outcome);
          if (month) params.set("month", month);
          navigate(
            `/dashboard/${encodeURIComponent(geographyId)}?${params.toString()}`,
          );
        }}
      />
    </HeatLbwLinkPanel>
  );

  return (
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

      {selectedCatalog?.visualization_type === "odds_ratio_icon_array" ||
      !selectedCatalog?.visualization_type ? (
        <div className={styles.grid}>
          <aside className={styles.learning}>
            <ScienceVideo />
            <RiskProtectionPanel
              outcomeLabel={outcomeLabel}
              contextFigure={exposedPopulationFigure(outcome)}
              description={selectedCatalog?.risk_description}
            />
          </aside>
          {cachedGeographies === null || resolvedCapabilities === null ? (
            // Wait for the geography and its published capabilities;
            // mounting now would load Kenya as a whole first, then the county.
            <section className={styles.panelPlaceholder} aria-busy="true" />
          ) : resolvedCapabilities.error ? (
            <section role="alert">
              Available outlook views could not load. Reload to try again.
            </section>
          ) : useOutlookPanel ? (
            // Published capabilities choose the view for every geography.
            <HeatOutlookPanel
              selection={
                outlookSelection?.key === outlookSelectionKey
                  ? outlookSelection.value
                  : undefined
              }
              onSelectionChange={(value) =>
                setOutlookSelection({ key: outlookSelectionKey, value })
              }
              dataModes={resolvedCapabilities.data?.data_modes}
              observedCapability={resolvedCapabilities.data?.observed}
              projectionRelease={resolvedCapabilities.data?.projection_release}
              observedContent={observedPanel}
              placeLabel={effectiveGeography?.name ?? stateLabel}
              geographyId={displayedAdminUnit ?? geographyId}
              mapGeographyId={geographyId}
              accessToken={session.accessToken}
              outcome={outcome}
              outcomeLabel={outcomeLabel}
              figure={iconArrayFigure(outcome)}
              onSelectArea={(nextGeography: string) => {
                const pickedArea = geographies.find((geo) => geo.id === nextGeography);
                // Observed county coverage can frame siblings even when the
                // projection frame has finer areas. Navigate to their real parent.
                const nextFrame = pickedArea?.parentId ?? geographyId;
                if (nextFrame === geographyId) setOptimisticAdminUnit(nextGeography);
                const params = new URLSearchParams();
                params.set("admin_unit", nextGeography);
                if (outcome) params.set("outcome", outcome);
                if (month) params.set("month", month);
                navigate(
                  `/dashboard/${encodeURIComponent(nextFrame)}?${params.toString()}`,
                );
              }}
            />
          ) : observedModelAvailable || !resolvedCapabilities.data?.observed ? (
            observedPanel
          ) : (
            <section role="status">
              {resolvedCapabilities.data.observed.reason ??
                "No observed model is available for this place and outcome."}
            </section>
          )}
        </div>
      ) : (
        <section className={styles.unsupportedVisualization} role="status">
          This model is available, but its dashboard visualization is not yet installed.
        </section>
      )}

      <RecommendedActionsPanel
        geographyId={geographyId}
        placeId={displayedAdminUnit ?? geographyId}
        placeName={effectiveGeography?.name ?? stateLabel}
        outcome={outcome}
        outcomeLabel={outcomeLabel}
        hazardLabel={selectedCatalog?.climate_hazard_label ?? "Climate hazard"}
        healthDomainLabel={
          selectedCatalog?.health_domain_label ?? "Climate-sensitive health"
        }
      />
    </main>
  );
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
