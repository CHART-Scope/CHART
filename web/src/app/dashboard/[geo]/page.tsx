"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import {
  DashboardHeader,
  HeatLbwLinkPanel,
  PredictionsPanel,
  RecommendedActionsPanel,
  RiskProtectionPanel,
  RunsStrip,
} from "@/features/dashboard";
import { DashboardContextBar } from "@/features/dashboard";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import {
  listGeographies,
  listModelCatalog,
  type GeographyRecord,
  type ModelCatalogEntry,
} from "@/lib/planningClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string; outcome?: string }>;
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

  return (
    <RequireAuth>
      {(session) => (
        <AuthorizedDashboard
          session={session}
          geographyId={params.geo}
          adminUnit={adminUnit}
          outcome={outcome}
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
}: {
  session: AuthSession;
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
}) {
  const router = useRouter();
  const [geographies, setGeographies] = useState<GeographyRecord[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);

  const hasAccess = useMemo(
    () => session.user.roles.length > 0 && session.user.geographyScopes.length > 0,
    [session.user.roles, session.user.geographyScopes],
  );

  useEffect(() => {
    if (!hasAccess) router.replace("/access-pending");
  }, [hasAccess, router]);

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (!cancelled) setGeographies(records);
      })
      .catch(() => {
        if (!cancelled) setGeographies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveAdminUnit = useMemo(() => {
    if (!adminUnit) return null;
    const candidate = geographies.find((geo) => geo.id === adminUnit);
    return candidate?.parentId === geographyId &&
      candidate.models?.some((model) => model.outcome === outcome)
      ? adminUnit
      : null;
  }, [adminUnit, geographies, geographyId, outcome]);

  useEffect(() => {
    if (!adminUnit || geographies.length === 0 || effectiveAdminUnit) return;
    router.replace(
      `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(outcome)}`,
    );
  }, [adminUnit, effectiveAdminUnit, geographies.length, geographyId, outcome, router]);

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
      `/dashboard/${encodeURIComponent(parent.id)}?admin_unit=${encodeURIComponent(geographyId)}&outcome=${encodeURIComponent(outcome)}`,
    );
  }, [geographies, geographyId, adminUnit, outcome, router]);

  useEffect(() => {
    let cancelled = false;
    listModelCatalog(geographyId, { includeDescendants: true })
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [geographyId]);

  const currentGeography = geographies.find((geo) => geo.id === geographyId);
  const effectiveGeography =
    geographies.find((geo) => geo.id === effectiveAdminUnit) ?? currentGeography;
  const country = currentGeography ? countryFromPath(currentGeography.path) : "";
  const areaName = currentGeography?.name ?? geographyId;
  const stateLabel = currentGeography
    ? `${currentGeography.name} (${currentGeography.levelLabel})`
    : areaName;
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
      `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(catalog[0].outcome)}`,
    );
  }, [catalog, geographyId, router, selectedCatalog]);

  useEffect(() => {
    if (
      !selectedCatalog ||
      selectedModel ||
      effectiveAdminUnit ||
      districts.length === 0
    ) {
      return;
    }
    router.replace(
      `/dashboard/${encodeURIComponent(geographyId)}?admin_unit=${encodeURIComponent(districts[0].code)}&outcome=${encodeURIComponent(outcome)}`,
    );
  }, [
    districts,
    effectiveAdminUnit,
    geographyId,
    outcome,
    router,
    selectedCatalog,
    selectedModel,
  ]);

  const nav = appNavForRoles(session.user.roles);
  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  const handleAdminUnitChange = useCallback(
    (code: string | null) => {
      const target =
        code === null
          ? `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(outcome)}`
          : `/dashboard/${encodeURIComponent(geographyId)}?admin_unit=${encodeURIComponent(code)}&outcome=${encodeURIComponent(outcome)}`;
      router.push(target);
    },
    [geographyId, outcome, router],
  );
  const handleOutcomeChange = useCallback(
    (nextOutcome: string) => {
      router.push(
        `/dashboard/${encodeURIComponent(geographyId)}?outcome=${encodeURIComponent(nextOutcome)}`,
      );
    },
    [geographyId, router],
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
        <main className={styles.page}>
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
              const params = new URLSearchParams();
              if (nextAdmin) params.set("admin_unit", nextAdmin);
              if (nextOutcome) params.set("outcome", nextOutcome);
              const query = params.toString() ? `?${params.toString()}` : "";
              router.push(`/dashboard/${encodeURIComponent(nextGeo)}${query}`);
            }}
          />
          <DashboardHeader
            country={country}
            areaName={areaName}
            hazardLabel={selectedCatalog?.climate_hazard_label ?? "Climate hazard"}
            healthDomainLabel={
              selectedCatalog?.health_domain_label ?? "Climate-sensitive health"
            }
            title={selectedCatalog?.dashboard_title ?? selectedCatalog?.outcome_label}
          />

          {selectedCatalog?.visualization_type === "odds_ratio_icon_array" ||
          !selectedCatalog?.visualization_type ? (
            <div className={styles.grid}>
              <RiskProtectionPanel
                outcomeLabel={outcomeLabel}
                description={selectedCatalog?.risk_description}
              />
              <HeatLbwLinkPanel
                placeLabel={effectiveGeography?.name ?? stateLabel}
                modelAreaName={selectedModel?.modelAreaName ?? null}
                outcome={outcome}
                outcomeLabel={outcomeLabel}
                figure="newborn"
                batchEnabled={
                  selectedCatalog?.batch_status !==
                  "blocked_pending_modeller_confirmation"
                }
                geographyId={effectiveAdminUnit ?? geographyId}
                accessToken={selectedModel ? session.accessToken : undefined}
              />
              {/* Predictions card temporarily hidden while the pipeline stabilises.
            <PredictionsPanel
              geographyId={geographyId}
              adminUnit={adminUnit}
              accessToken={session.accessToken}
              supportsPrediction={currentGeography?.supportsPrediction ?? undefined}
            />
            */}
            </div>
          ) : (
            <section className={styles.unsupportedVisualization} role="status">
              This model is available, but its dashboard visualization is not yet
              installed.
            </section>
          )}

          {/* Recent runs moved to Settings (Dagster + DB view live together there).
          <RunsStrip
            geographyId={geographyId}
            adminUnit={adminUnit}
            accessToken={session.accessToken}
            linkForRun={(id) => {
              const base = `/dashboard/${encodeURIComponent(geographyId)}/runs/${id}`;
              return adminUnit === null
                ? base
                : `${base}?admin_unit=${encodeURIComponent(adminUnit)}`;
            }}
          />
          */}

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
