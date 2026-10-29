"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/Button";
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
  dashboardHref,
  readOutlookChoices,
  type DashboardSearch,
} from "@/features/dashboard/dashboardNavigation";

import {
  fetchOutlookCapabilities,
  type OutlookCapabilities,
} from "@/lib/heatOutlookClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<DashboardSearch>;
};

export default function DashboardGeoPage(props: PageProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const adminUnit = searchParams.admin_unit ?? null;
  const outcome = searchParams.outcome ?? "lbw";
  const choices = useMemo(() => readOutlookChoices(searchParams), [searchParams]);

  return (
    <Dashboard
      geographyId={params.geo}
      adminUnit={adminUnit}
      outcome={outcome}
      choices={choices}
    />
  );
}

function Dashboard({
  geographyId,
  adminUnit,
  outcome,
  choices,
}: {
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
  choices: OutlookChoices;
}) {
  // The workspace layout restores the session and sends an account without a
  // planning area to /access-pending before this renders.
  const session = useSession();
  const router = useRouter();
  const [mapRefresh, setMapRefresh] = useState(0);
  const month = choices.month ?? null;
  // Selecting sibling districts/constituencies should feel like direct
  // manipulation. The URL remains
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
    router.replace(dashboardHref({ geographyId, outcome, choices }), { scroll: false });
  }, [
    adminUnit,
    effectiveAdminUnit,
    geographies.length,
    geographyId,
    outcome,
    choices,
    router,
  ]);

  // A direct district/constituency link reuses its parent's map so siblings
  // remain available. Places with children own their map frame.
  useEffect(() => {
    if (geographies.length === 0 || adminUnit) return;
    const current = geographies.find((geo) => geo.id === geographyId);
    if (!current?.parentId) return;
    const hasChildren = geographies.some((geo) => geo.parentId === current.id);
    if (hasChildren) return;
    const parent = geographies.find((geo) => geo.id === current.parentId);
    if (!parent || !canUseArea(parent, session.user.geographyScopes)) return;
    router.replace(
      dashboardHref({
        geographyId: parent.id,
        adminUnit: geographyId,
        outcome,
        choices,
      }),
      { scroll: false },
    );
  }, [
    geographies,
    geographyId,
    adminUnit,
    outcome,
    choices,
    router,
    session.user.geographyScopes,
  ]);

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
    router.replace(
      dashboardHref({
        geographyId: state.id,
        adminUnit: asked?.parentId === state.id ? asked.id : null,
        outcome,
        choices,
      }),
      { scroll: false },
    );
  }, [geographies, geographyId, adminUnit, outcome, choices, router]);

  // Older links selected a division/county inside its parent's map. A place
  // with children owns its frame. A leaf also keeps its own route if the user
  // cannot read the parent; the API returns only the permitted outline.
  useEffect(() => {
    if (!effectiveAdminUnit) return;
    const selected = geographies.find((geo) => geo.id === effectiveAdminUnit);
    const frame = geographies.find((geo) => geo.id === geographyId);
    const hasChildren = geographies.some((geo) => geo.parentId === effectiveAdminUnit);
    const unreadableFrame =
      selected &&
      frame &&
      canUseArea(selected, session.user.geographyScopes) &&
      !canUseArea(frame, session.user.geographyScopes);
    if (!hasChildren && !unreadableFrame) return;
    router.replace(
      dashboardHref({ geographyId: effectiveAdminUnit, outcome, choices }),
      { scroll: false },
    );
  }, [
    effectiveAdminUnit,
    geographies,
    geographyId,
    outcome,
    choices,
    router,
    session.user.geographyScopes,
  ]);

  const currentGeography = geographies.find((geo) => geo.id === geographyId);
  const selectedGeographyId = displayedAdminUnit ?? geographyId;
  const effectiveGeography =
    geographies.find((geo) => geo.id === selectedGeographyId) ?? currentGeography;
  const parentGeography = geographies.find(
    // A country with no model of its own is a routing container; going back
    // there would immediately redirect to the same state again.
    (geo) => geo.id === effectiveGeography?.parentId && (geo.models?.length ?? 0) > 0,
  );
  const selectMapArea = (nextGeographyId: string, nextChoices = choices) => {
    const picked = geographies.find((geo) => geo.id === nextGeographyId);
    if (!picked || !canUseArea(picked, session.user.geographyScopes)) return;
    const hasChildren = geographies.some((geo) => geo.parentId === picked.id);
    const parent = geographies.find((geo) => geo.id === picked.parentId);
    const frame =
      !hasChildren && parent && canUseArea(parent, session.user.geographyScopes)
        ? parent.id
        : picked.id;
    const nextAdmin = frame === picked.id ? null : picked.id;
    if (frame === geographyId) setOptimisticAdminUnit(nextAdmin);
    navigate(
      dashboardHref({
        geographyId: frame,
        adminUnit: nextAdmin,
        outcome,
        choices: nextChoices,
      }),
    );
  };
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
      dashboardHref({
        geographyId,
        adminUnit,
        outcome: catalog[0].outcome,
        choices: { ...choices, selector: undefined, observedSelector: undefined },
      }),
    );
  }, [catalog, geographyId, adminUnit, choices, router, selectedCatalog]);

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
      dashboardHref({ geographyId, adminUnit: districts[0].code, outcome, choices }),
      { scroll: false },
    );
  }, [
    districts,
    effectiveAdminUnit,
    geographyId,
    outcome,
    choices,
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
      onMonthChange={(nextMonth) =>
        navigate(
          dashboardHref({
            geographyId,
            adminUnit,
            outcome,
            choices: { ...choices, month: nextMonth, view: "observed" },
          }),
        )
      }
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
        onSelect={(nextGeography) =>
          selectMapArea(nextGeography, { ...choices, view: "observed" })
        }
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
      {parentGeography && canUseArea(parentGeography, session.user.geographyScopes) && (
        <nav aria-label="Map navigation">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(
                dashboardHref({ geographyId: parentGeography.id, outcome, choices }),
              )
            }
          >
            Back to {parentGeography.name}
          </Button>
        </nav>
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
          navigate(
            dashboardHref({
              geographyId: nextGeo,
              adminUnit: nextAdmin,
              outcome: nextOutcome,
              choices:
                nextOutcome === outcome
                  ? choices
                  : { ...choices, selector: undefined, observedSelector: undefined },
            }),
          );
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
              selection={choices}
              onSelectionChange={(nextChoices) =>
                navigate(
                  dashboardHref({
                    geographyId,
                    adminUnit,
                    outcome,
                    choices: nextChoices,
                  }),
                )
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
              onSelectArea={selectMapArea}
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
