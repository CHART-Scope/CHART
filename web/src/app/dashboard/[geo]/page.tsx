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
  RiskProtectionPanel,
} from "@/features/dashboard";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import { listGeographies, type GeographyRecord } from "@/lib/planningClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string }>;
};


/**
 * MVP: the plan-page Mad Libs is locked to Extreme heat + Maternal /
 * newborn / child health. When the model registry surfaces the deployed
 * hazard + domain per geography, source these from there instead.
 */
const DEPLOYED_HAZARD_LABEL = "Extreme heat";
const DEPLOYED_HEALTH_DOMAIN_SHORT = "MNCH";


export default function DashboardGeoPage(props: PageProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const adminUnit = searchParams.admin_unit ?? null;

  return (
    <RequireAuth>
      {(session) => (
        <AuthorizedDashboard
          session={session}
          geographyId={params.geo}
          adminUnit={adminUnit}
        />
      )}
    </RequireAuth>
  );
}


function AuthorizedDashboard({
  session,
  geographyId,
  adminUnit,
}: {
  session: AuthSession;
  geographyId: string;
  adminUnit: string | null;
}) {
  const router = useRouter();
  const [geographies, setGeographies] = useState<GeographyRecord[]>([]);

  const hasAccess = useMemo(
    () =>
      session.user.roles.length > 0 && session.user.geographyScopes.length > 0,
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

  const currentGeography = geographies.find((geo) => geo.id === geographyId);
  const country = currentGeography ? countryFromPath(currentGeography.path) : "";
  const areaName = currentGeography?.name ?? geographyId;
  const stateLabel = currentGeography
    ? `${currentGeography.name} (${currentGeography.levelLabel})`
    : areaName;

  const districts = useMemo(() => {
    if (!currentGeography) return [];
    const parentPrefix = `${currentGeography.path}/`;
    return geographies
      .filter((geo) => geo.path.startsWith(parentPrefix))
      .filter((geo) => geo.supportsPrediction !== false)
      .map((geo) => ({ code: geo.id, name: geo.name }));
  }, [currentGeography, geographies]);

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
      const target = code === null
        ? `/dashboard/${encodeURIComponent(geographyId)}`
        : `/dashboard/${encodeURIComponent(geographyId)}?admin_unit=${encodeURIComponent(code)}`;
      router.push(target);
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
          <DashboardHeader
            country={country}
            areaName={areaName}
            hazardLabel={DEPLOYED_HAZARD_LABEL}
            healthDomainLabel={DEPLOYED_HEALTH_DOMAIN_SHORT}
          />

          <div className={styles.grid}>
            <RiskProtectionPanel />
            <HeatLbwLinkPanel
              stateLabel={stateLabel}
              districts={districts}
              activeAdminUnitCode={adminUnit}
              onAdminUnitChange={handleAdminUnitChange}
            />
            <PredictionsPanel
              geographyId={geographyId}
              adminUnit={adminUnit}
              accessToken={session.accessToken}
            />
          </div>

          <section className={styles.recommendedActions}>
            <p className={styles.recommendedEyebrow}>Recommended actions</p>
            <p className={styles.recommendedBody}>
              Actions from the reviewed solutions repository will appear here
              once your first prediction has completed.
            </p>
          </section>
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
