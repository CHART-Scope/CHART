"use client";

import { useEffect, useState } from "react";

import { RISK_BANDS } from "@/features/dashboard/SpatialRiskMap";
import { fetchRiskMap, type MapResponse } from "@/lib/dashboardClient";
import { fetchHeatOutlookMap } from "@/lib/heatOutlookClient";

import styles from "./PriorityAreas.module.css";

/** Shares at or above this are "elevated" (the map's 5–10% band and up). */
const ELEVATED_PERCENT = 5;
const SHOWN_DOTS = 7;

export type PriorityArea = { name: string; percent: number; fill: string };
export type PriorityAreas = { areas: PriorityArea[]; levelLabel: string };

const cache = new Map<string, PriorityAreas>();

/**
 * The areas of the place being viewed at elevated risk, highest first, read
 * from the same map the dashboard shows: the published outlook where there is
 * one, else the observed risk map. Shared by every action card, which lists
 * them as the places to start.
 */
export function usePriorityAreas(geographyId: string, outcome: string) {
  const key = `${geographyId}:${outcome}`;
  const [loaded, setLoaded] = useState<{ key: string; value: PriorityAreas | null }>();
  useEffect(() => {
    if (cache.has(key)) return;
    const controller = new AbortController();
    fetchHeatOutlookMap(geographyId, undefined, { outcome })
      .catch(() =>
        fetchRiskMap(geographyId, undefined, { outcome, signal: controller.signal }),
      )
      .then((map) => {
        const value = priorityFrom(map);
        cache.set(key, value);
        if (!controller.signal.aborted) setLoaded({ key, value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, value: null });
      });
    return () => controller.abort();
  }, [geographyId, outcome, key]);
  return cache.get(key) ?? (loaded?.key === key ? loaded.value : null);
}

function priorityFrom(map: MapResponse): PriorityAreas {
  const areas = map.areas
    .filter(
      (area) => area.value_percent !== null && area.value_percent >= ELEVATED_PERCENT,
    )
    .sort((a, b) => (b.value_percent as number) - (a.value_percent as number))
    .map((area) => ({
      // "Bhopal Division" reads as "Bhopal", as on the dashboard.
      name: area.name.replace(new RegExp(`\\s+${area.level}$`, "i"), ""),
      percent: area.value_percent as number,
      fill: RISK_BANDS.find((band) => (area.value_percent as number) < band.upper)!
        .fill,
    }));
  const level = map.areas[0]?.level ?? "area";
  return { areas, levelLabel: level };
}

/**
 * "● ● ● Sheopur, Satna +5 more districts at elevated risk" (list) or, on a
 * Gantt card, the same under a "Priority districts" heading.
 */
export function PriorityAreasLine({
  priority,
  variant,
}: {
  priority: PriorityAreas | null;
  variant: "list" | "gantt";
}) {
  if (!priority || priority.areas.length === 0) return null;
  const { areas, levelLabel } = priority;
  const named = areas
    .slice(0, 2)
    .map((area) => area.name)
    .join(", ");
  const more = areas.length - 2;
  const plural = pluralLevel(levelLabel);
  const listed = more > 0 ? `${named} +${more} more` : named;
  const text =
    variant === "list"
      ? `${listed}${more > 0 ? ` ${plural}` : ""} at elevated risk`
      : listed;
  return (
    <span className={styles.wrap} data-variant={variant}>
      {variant === "gantt" ? (
        <span className={styles.heading}>Priority {plural}</span>
      ) : null}
      <span className={styles.line}>
        {areas.slice(0, SHOWN_DOTS).map((area) => (
          <span
            key={area.name}
            className={styles.dot}
            style={{ background: area.fill }}
            title={`${area.name}: ${area.percent.toFixed(1)}%`}
            aria-hidden="true"
          />
        ))}
        <span className={styles.names}>{text}</span>
      </span>
    </span>
  );
}

function pluralLevel(level: string): string {
  const word = level.trim().toLowerCase() || "area";
  return /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
}
