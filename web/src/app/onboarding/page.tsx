"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { dashboardPath } from "@/features/auth/dashboardPath";
import { RequireAuth } from "@/features/auth/RequireAuth";
import {
  exampleSetupSectors,
  OnboardingWizard,
  type OnboardingState,
  type SetupSector,
  useOnboardingStore,
} from "@/features/onboarding";
import { restoreAuthSession, type AuthSession } from "@/lib/authClient";
import {
  completeChartSetup,
  getSetupOptions,
  getSetupStatus,
  loadActionRepository,
  type ActionRepositoryStatus,
} from "@/lib/setupClient";
import type { SetupCountryOption } from "@/features/onboarding/data/geo";
import styles from "./setup-state.module.css";

type LoadingStage = "setup" | "repository";

type PageState =
  | { phase: "loading"; stage: LoadingStage }
  | {
      phase: "setup";
      sectors: SetupSector[];
      geographies: SetupCountryOption[];
      repository: ActionRepositoryStatus;
    }
  | { phase: "error"; message: string };

/** Setup is run by a signed-in administrator: on a new installation, the
 * default `admin` after changing its first password (docs/installation-setup.md). */
export default function OnboardingPage() {
  return <RequireAuth>{(session) => <Onboarding session={session} />}</RequireAuth>;
}

function Onboarding({ session }: { session: AuthSession }) {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>({
    phase: "loading",
    stage: "setup",
  });

  const loadSetup = useCallback(async () => {
    setPageState({ phase: "loading", stage: "setup" });
    try {
      if (!session.user.roles.includes("chart_admin")) {
        setPageState({
          phase: "error",
          message: "Only a CHART administrator can set up CHART. Sign in as admin.",
        });
        return;
      }
      const status = await getSetupStatus();
      if (!status.requiresOnboarding) {
        router.replace("/");
        return;
      }

      const options = await getSetupOptions();
      setPageState({ phase: "loading", stage: "repository" });
      const repository = await loadActionRepository();
      setPageState({
        phase: "setup",
        sectors: options.sectors?.length ? options.sectors : exampleSetupSectors,
        geographies: options.geographies ?? [],
        repository,
      });
    } catch (error) {
      setPageState({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "CHART installation setup is unavailable.",
      });
    }
  }, [router, session.user.roles]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  async function launch(state: OnboardingState) {
    if (pageState.phase !== "setup") return;

    await completeChartSetup(state, pageState.geographies, session.accessToken);
    useOnboardingStore.getState().reset();
    // A fresh token carries the installed country this setup gave the account.
    const fresh = await restoreAuthSession();
    router.replace(await dashboardPath(fresh.user).catch(() => "/plan"));
  }

  if (pageState.phase === "setup") {
    return (
      <OnboardingWizard
        sectors={pageState.sectors}
        geographyCatalog={pageState.geographies}
        actionRepositoryCount={pageState.repository.actionCount}
        onLaunch={(state) => launch(state)}
      />
    );
  }

  return (
    <main className={styles.page}>
      <section
        className={styles.card}
        aria-busy={pageState.phase === "loading"}
        aria-live="polite"
      >
        <span>CHART installation</span>
        <h1>
          {pageState.phase === "error"
            ? "Setup could not be opened"
            : pageState.stage === "repository"
              ? "Loading action repository"
              : "Checking setup"}
        </h1>
        <p>
          {pageState.phase === "error"
            ? pageState.message
            : pageState.stage === "repository"
              ? "Loading the published actions and their tracking IDs for this workspace."
              : "Confirming whether this installation has already been configured."}
        </p>
        {pageState.phase === "loading" ? (
          <>
            <div className={styles.progress} aria-hidden="true">
              <span />
            </div>
            <p className={styles.resetNote}>
              This readiness check runs again whenever installation setup is reset.
            </p>
          </>
        ) : null}
        {pageState.phase === "error" ? (
          <div className={styles.actions}>
            <Button onClick={() => void loadSetup()}>Try again</Button>
            <Button variant="secondary" onClick={() => router.replace("/")}>
              Return to sign in
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
