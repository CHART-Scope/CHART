"use client";

import { useEffect, useState } from "react";

import {
  type Action,
  type CostLevel,
  HEAT_HAZARD,
  listActions,
} from "@/lib/actionsClient";
import type { PlanTiming } from "@/lib/savedPlansClient";

export type { Action, CostLevel };

export const seasons = ["before", "during", "after"] as const satisfies PlanTiming[];
export type Season = PlanTiming;

/** Dots shown for a cost level; "Variable" and an unassessed cost show none. */
export const costDots: Partial<Record<CostLevel, number>> = {
  "No additional cost": 0,
  Low: 1,
  Medium: 2,
  High: 3,
};

// An emoji per action type for the list cards, as on the design, until
// the action repository carries its own images.
const typeEmojis: [prefix: string, emoji: string][] = [
  ["Infrastructure", "🏗️"],
  ["Supplies", "🩹"],
  ["Clinical", "🩺"],
  ["Capacity", "🎓"],
  ["Behaviour", "🗣️"],
  ["Early warning", "📢"],
  ["Policy", "📜"],
  ["Technology", "📱"],
  ["Financing", "💰"],
  ["Environment", "🌳"],
];

export function actionTypeEmoji(actionType: string | undefined): string {
  return typeEmojis.find(([prefix]) => actionType?.startsWith(prefix))?.[1] ?? "📋";
}

/**
 * The heat actions for a place, in its country's wording, from the API.
 * `retry` reloads after a failure.
 */
/** Heat actions per geography for the session: the feed changes hourly at
 * most, so returning to a place shows its list at once. */
const heatActionCache = new Map<string, Action[]>();

export function useHeatActions(geographyId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    actions?: Action[];
    error?: string;
  }>();
  const key = `${geographyId}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    listActions(geographyId, controller.signal)
      .then((list) => {
        const actions = list.items.filter((action) =>
          action.hazards.includes(HEAT_HAZARD),
        );
        heatActionCache.set(geographyId, actions);
        setState({ key, actions });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    return () => controller.abort();
  }, [geographyId, key]);

  const current = state?.key === key ? state : undefined;
  // While another place's list loads, keep this place's cached list, else
  // the last one shown, rather than emptying the panel.
  const actions =
    current?.actions ??
    (current?.error ? undefined : heatActionCache.get(geographyId)) ??
    (current?.error ? [] : state?.actions) ??
    [];
  return {
    actions,
    loading: current === undefined && actions.length === 0,
    error: current?.error ?? null,
    retry: () => setAttempt((n) => n + 1),
  };
}

export type TextBlock =
  { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

const listMarker = /^(?:[•*-]|\d+[.)])\s+/;

/**
 * Curators write plain text: blank lines separate paragraphs, and lines that
 * start with "•", "-" or "1." are list items.
 */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const line of text.split("\n").map((value) => value.trim())) {
    const last = blocks.at(-1);
    if (!line) {
      blocks.push({ kind: "paragraph", text: "" });
    } else if (listMarker.test(line)) {
      const item = line.replace(listMarker, "");
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks.filter((block) => block.kind === "list" || block.text);
}
