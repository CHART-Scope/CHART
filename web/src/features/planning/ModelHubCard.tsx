"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listModelReleases, type ReleaseInfo } from "@/lib/modelsClient";

import { SettingsCard } from "./SettingsCard";
import styles from "./ModelHubCard.module.css";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; releases: ReleaseInfo[] }
  | { kind: "error"; message: string };

export function ModelHubCard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    listModelReleases()
      .then((releases) => {
        if (!cancelled) setState({ kind: "loaded", releases });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = (() => {
    if (state.kind !== "loaded") return null;
    const total = state.releases.length;
    const active = state.releases.filter((release) => release.is_active).length;
    if (total === 0) return "No model releases installed yet.";
    return (
      <>
        <span className={styles.strong}>{active}</span> active of{" "}
        <span className={styles.strong}>{total}</span> installed release
        {total === 1 ? "" : "s"}.
      </>
    );
  })();

  return (
    <SettingsCard
      eyebrow="Models"
      title="Fitted models"
      headingId="model-hub-heading"
      loading={state.kind === "loading"}
      loadingRows={1}
      error={state.kind === "error" ? `Could not load models (${state.message})` : null}
      action={
        <Link href="/settings/models" className={styles.button}>
          Model hub →
        </Link>
      }
    >
      {summary ? <p className={styles.count}>{summary}</p> : null}
    </SettingsCard>
  );
}
