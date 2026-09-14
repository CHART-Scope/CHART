"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listModelReleases, type ReleaseInfo } from "@/lib/modelsClient";

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
    switch (state.kind) {
      case "loading":
        return "Loading installed models…";
      case "error":
        return `Could not load models (${state.message})`;
      case "loaded": {
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
      }
    }
  })();

  return (
    <section className={styles.card}>
      <div className={styles.left}>
        <p className={styles.title}>Models</p>
        <p className={styles.count}>{summary}</p>
      </div>
      <Link href="/settings/models" className={styles.button}>
        Model hub →
      </Link>
    </section>
  );
}
