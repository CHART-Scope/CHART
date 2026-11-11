"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import {
  ActionRepository,
  ActionViewToggle,
  type ActionView,
  FALLBACK_CALENDAR,
  PlanRecommendations,
  seasons,
  useActionProgress,
  useHeatActions,
} from "@/features/actions";
import { type HeatSeasonLayout } from "@/features/actions/ActionGantt";
import { DashboardHeader } from "@/features/dashboard";
import { getHeatSeason } from "@/lib/heatSeasonsClient";
import { getSavedPlan, type SavedPlan } from "@/lib/savedPlansClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";

import styles from "./page.module.css";

type Query = {
  admin_unit?: string;
  outcome?: string;
  season?: string;
  view?: string;
  action?: string;
  plan?: string;
};
type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<Query>;
};

/** Accounts without a planning area are sent to /explore by the
 * workspace layout before this renders. */
export default function RecommendedActionsPage(props: PageProps) {
  const geographyId = use(props.params).geo;
  const query = use(props.searchParams);
  const router = useRouter();
  const placeId = query.admin_unit ?? geographyId;
  const outcome = query.outcome ?? "lbw";
  const planId = query.plan ?? null;
  const [plan, setPlan] = useState<{ id: string; data?: SavedPlan; error?: string }>();
  useEffect(() => {
    if (!planId) return;
    const controller = new AbortController();
    getSavedPlan(planId, controller.signal)
      .then((data) => setPlan({ id: planId, data }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setPlan({ id: planId, error: error.message });
      });
    return () => controller.abort();
  }, [planId]);
  const loadedPlan = plan?.id === planId ? plan : undefined;
  // The view, timeframe and open action live in the URL so a reload, the
  // back button or a shared link land on the same view. A plan opens on its
  // own season; "all" records clearing it.
  const season =
    query.season === "all"
      ? null
      : (seasons.find((value) => value === query.season) ??
        loadedPlan?.data?.signals.timing ??
        null);
  const view: ActionView = query.view === "gantt" ? "gantt" : "list";
  const selectedId = query.action ?? null;
  const heatSeason = useHeatSeasonLayout(placeId);

  const { geographies } = useGeographies();
  const { catalog } = useModelCatalog(geographyId);
  const progress = useActionProgress(placeId);
  const { actions, loading, error, retry } = useHeatActions(geographyId);

  const trail = useMemo(() => {
    const byId = new Map((geographies ?? []).map((geo) => [geo.id, geo]));
    const names: string[] = [];
    for (
      let geo = byId.get(placeId);
      geo;
      geo = geo.parentId ? byId.get(geo.parentId) : undefined
    ) {
      names.unshift(geo.name);
    }
    return names.length > 0 ? names : [placeId];
  }, [geographies, placeId]);
  const entry = catalog?.find((item) => item.outcome === outcome);
  const hazardLabel = entry?.climate_hazard_label ?? "Extreme heat";
  const domainLabel = entry?.health_domain_label ?? "Maternal and child health";
  const outcomeLabel = (entry?.outcome_label ?? "low birth weight").toLowerCase();

  const dashboardQuery = new URLSearchParams({ outcome });
  if (query.admin_unit) dashboardQuery.set("admin_unit", query.admin_unit);
  const dashboardHref = `/dashboard/${encodeURIComponent(geographyId)}?${dashboardQuery}`;

  function setQuery(change: {
    season?: string | null;
    view?: ActionView;
    action?: string | null;
  }) {
    const next = new URLSearchParams(dashboardQuery);
    if (planId) next.set("plan", planId);
    const merged = { season, view, action: selectedId, ...change };
    // With a plan the default season is the plan's, so record clearing it.
    if (merged.season) next.set("season", merged.season);
    else if (planId) next.set("season", "all");
    if (merged.view === "gantt") next.set("view", "gantt");
    if (merged.action) next.set("action", merged.action);
    router.replace(`/dashboard/${encodeURIComponent(geographyId)}/actions?${next}`, {
      scroll: false,
    });
  }

  return (
    <main className={styles.page}>
      <Link href={dashboardHref} className={styles.back}>
        ← Back to dashboard
      </Link>
      <DashboardHeader
        trail={[...trail, "Recommended actions"]}
        hazardLabel={hazardLabel}
        healthDomainLabel={domainLabel}
      />
      <div className={styles.intro}>
        <div>
          <h1 className={styles.title}>Recommended actions</h1>
          <p className={styles.lede}>
            Actions recommended for {domainLabel.toLowerCase()} under{" "}
            {hazardLabel.toLowerCase()} — filtered from the CHART action repository,
            with the context, steps and evidence behind each one. Set a status to track
            follow-up.
          </p>
        </div>
        <ActionViewToggle view={view} onChange={(next) => setQuery({ view: next })} />
      </div>
      {planId && !loadedPlan ? (
        <p role="status" className={styles.lede}>
          Loading your plan…
        </p>
      ) : null}
      {loadedPlan?.error ? (
        <p role="alert" className={styles.lede}>
          {loadedPlan.error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className={styles.lede}>
          Loading recommended actions…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className={styles.lede}>
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}
      {loadedPlan?.data && !loading && !error ? (
        <PlanRecommendations
          plan={loadedPlan.data}
          actions={actions}
          outcomeLabel={outcomeLabel}
          onOpen={(action) => setQuery({ action })}
        />
      ) : null}
      <ActionRepository
        actions={actions}
        progress={progress}
        view={view}
        season={season}
        onSeasonChange={(next) => setQuery({ season: next, action: null })}
        heatSeason={heatSeason}
        selectedId={selectedId}
        onSelect={(action) => setQuery({ action })}
        contextLabel={`${hazardLabel} · ${domainLabel} · ${trail.at(-1)}`}
      />
    </main>
  );
}

/** The place's heat-season calendar from Settings > Heat seasons (its own,
 * an ancestor's or the official season), or India's until it loads, so the
 * cycle still draws when it cannot. */
function useHeatSeasonLayout(placeId: string) {
  const [loaded, setLoaded] = useState<{ id: string; layout: HeatSeasonLayout }>();
  useEffect(() => {
    const controller = new AbortController();
    getHeatSeason(placeId, controller.signal)
      .then((season) => {
        if (controller.signal.aborted || !season.months) return;
        setLoaded({
          id: placeId,
          layout: {
            calendar: season.months,
            placeName: season.inherited_from ?? season.name,
          },
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [placeId]);
  return loaded?.id === placeId
    ? loaded.layout
    : { calendar: FALLBACK_CALENDAR, placeName: null };
}
