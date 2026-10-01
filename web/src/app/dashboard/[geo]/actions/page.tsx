"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import {
  ActionsLibrary,
  heatHazardKey,
  listActions,
  seasons,
  useActionProgress,
} from "@/features/actions";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { DashboardHeader } from "@/features/dashboard";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";

import styles from "./page.module.css";

type Query = {
  admin_unit?: string;
  outcome?: string;
  season?: string;
  action?: string;
};
type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<Query>;
};

export default function RecommendedActionsPage(props: PageProps) {
  const params = use(props.params);
  const query = use(props.searchParams);
  return (
    <RequireAuth>
      {(session) => (
        <AuthorizedActions session={session} geographyId={params.geo} query={query} />
      )}
    </RequireAuth>
  );
}

function AuthorizedActions({
  session,
  geographyId,
  query,
}: {
  session: AuthSession;
  geographyId: string;
  query: Query;
}) {
  const router = useRouter();
  const placeId = query.admin_unit ?? geographyId;
  const outcome = query.outcome ?? "lbw";
  // Season and the open action live in the URL so a reload, the back button
  // or a shared link land on the same view.
  const season = seasons.find((value) => value === query.season) ?? seasons[0];
  const selectedId = query.action ?? null;

  const { geographies } = useGeographies();
  const { catalog } = useModelCatalog(geographyId);
  const progress = useActionProgress(placeId);
  const actions = useMemo(() => listActions(heatHazardKey), []);

  const hasAccess =
    session.user.roles.length > 0 && session.user.geographyScopes.length > 0;
  useEffect(() => {
    if (!hasAccess) router.replace("/access-pending");
  }, [hasAccess, router]);

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

  function setQuery(change: { season?: string; action?: string | null }) {
    const next = new URLSearchParams(dashboardQuery);
    const merged = { season, action: selectedId, ...change };
    if (merged.season !== seasons[0]) next.set("season", merged.season);
    if (merged.action) next.set("action", merged.action);
    router.replace(`/dashboard/${encodeURIComponent(geographyId)}/actions?${next}`, {
      scroll: false,
    });
  }

  const nav = appNavForRoles(session.user.roles);
  const handleNavigate = (id: string) => {
    const target = NAV_ROUTE[id];
    if (target) router.push(target);
  };

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
            <h1 className={styles.title}>Recommended actions</h1>
            <p className={styles.lede}>
              Actions recommended for {domainLabel.toLowerCase()} under{" "}
              {hazardLabel.toLowerCase()}, with the context, steps and evidence behind
              each one. Set a status or assign districts to track follow-up.
            </p>
          </div>
          <ActionsLibrary
            actions={actions}
            progress={progress}
            season={season}
            onSeasonChange={(next) => setQuery({ season: next, action: null })}
            selectedId={selectedId}
            onSelect={(action) => setQuery({ action })}
            contextLabel={`${hazardLabel} · ${domainLabel} · ${trail.at(-1)}`}
            hazardLabel={hazardLabel}
            outcomeLabel={outcomeLabel}
          />
        </main>
      </AppShell>
    </>
  );
}
