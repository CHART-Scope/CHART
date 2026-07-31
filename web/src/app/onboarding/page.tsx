"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import {
  exampleSetupSectors,
  Login,
  OnboardingWizard,
  type OnboardingState,
  type SetupSector,
} from "@/features/onboarding";
import {
  bootstrapChartSetup,
  getSetupOptions,
  getSetupStatus,
  loadActionRepository,
  type ActionRepositoryStatus,
} from "@/lib/setupClient";
import styles from "./setup-state.module.css";

type LoadingStage = "setup" | "repository";

type PageState =
  | { phase: "loading"; stage: LoadingStage }
  | {
      phase: "setup";
      sectors: SetupSector[];
      repository: ActionRepositoryStatus;
    }
  | { phase: "complete"; repository: ActionRepositoryStatus }
  | { phase: "error"; message: string };

export default function OnboardingPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>({
    phase: "loading",
    stage: "setup",
  });

  const loadSetup = useCallback(async () => {
    setPageState({ phase: "loading", stage: "setup" });
    try {
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
  }, [router]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  async function launch(state: OnboardingState) {
    if (pageState.phase !== "setup") return;

    await bootstrapChartSetup(state);
    setPageState({ phase: "complete", repository: pageState.repository });
  }

  if (pageState.phase === "setup") {
    return (
      <OnboardingWizard
        sectors={pageState.sectors}
        actionRepositoryCount={pageState.repository.actionCount}
        onLaunch={(state) => launch(state)}
      />
    );
  }

  if (pageState.phase === "complete") {
    return <Login setupMode="configured" />;
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
