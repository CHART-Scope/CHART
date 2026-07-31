"use client";

import { useEffect, useState } from "react";

import {
  fetchCurrentObservation,
  type CurrentObservationResponse,
} from "@/lib/dashboardClient";

import styles from "./TodayStrip.module.css";


type Props = {
  geographyId: string;
  adminUnit: string | null;
  accessToken?: string;
};


type Load =
  | { status: "loading" }
  | { status: "ready"; data: CurrentObservationResponse }
  | { status: "error"; message: string };


const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];


const VARIABLE_LABELS: Record<string, string> = {
  tmax_monthly_mean_c: "monthly mean max",
  tmax_monthly_max_c: "monthly peak max",
  heatwave_days: "heatwave days this month",
};


export function TodayStrip({ geographyId, adminUnit, accessToken }: Props) {
  const [state, setState] = useState<Load>({ status: "loading" });
  const today = todayLabel();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchCurrentObservation(geographyId, adminUnit, accessToken)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load current reading.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, adminUnit, geographyId]);

  return (
    <aside className={styles.strip} aria-label="Today's observed climate reading">
      <div>
        <p className={styles.eyebrow}>Today</p>
        <p className={styles.today}>{today}</p>
      </div>
      <div className={styles.value}>{renderValue(state)}</div>
      <div className={styles.source}>{renderSource(state)}</div>
    </aside>
  );
}


function renderValue(state: Load): string {
  if (state.status === "loading") return "…";
  if (state.status === "error") return "—";
  const { data } = state;
  if (data.value === null) return "No reading yet";
  const rounded = Math.round(data.value * 10) / 10;
  const unit = data.unit === "celsius" || data.variable?.endsWith("_c") ? "°C" : (data.unit ?? "");
  return `${rounded}${unit}`;
}


function renderSource(state: Load): string {
  if (state.status !== "ready") return "";
  const { data } = state;
  if (data.value === null) {
    return "Reanalysis has not yet reached this place.";
  }
  const label = data.variable ? VARIABLE_LABELS[data.variable] ?? data.variable : "observed";
  const month = data.period_month ? formatPeriod(data.period_month) : null;
  const parts = [label];
  if (month) parts.push(`as of ${month}`);
  if (data.source_name) parts.push(`(${data.source_name})`);
  return parts.join(" · ");
}


function todayLabel(): string {
  const now = new Date();
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}


function formatPeriod(iso: string): string {
  if (iso.length < 7) return iso;
  const monthIndex = Number.parseInt(iso.slice(5, 7), 10) - 1;
  const year = iso.slice(0, 4);
  const name = MONTH_NAMES[monthIndex] ?? "";
  return `${name} ${year}`;
}
