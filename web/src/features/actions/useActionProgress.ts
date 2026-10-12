"use client";

import { useCallback, useEffect, useState } from "react";

export const actionStatuses = ["not-started", "in-progress", "completed"] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const statusLabels: Record<ActionStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

export type Assignment = {
  districts: string[];
  assignee: string;
  dueDate: string;
  notes: string;
};

type Progress = Record<string, { status?: ActionStatus; assignment?: Assignment }>;

const storageKey = (geographyId: string) => `chart.actions.progress.${geographyId}`;

/**
 * Status and district assignments a planner records against each action for
 * one place. Kept in this browser until the planning API stores them, so the
 * dashboard list and the full actions page stay in step with each other.
 */
export function useActionProgress(geographyId: string) {
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    setProgress(readProgress(geographyId));
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(geographyId)) setProgress(readProgress(geographyId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [geographyId]);

  const update = useCallback(
    (actionId: string, change: Progress[string]) => {
      setProgress((current) => {
        const next = { ...current, [actionId]: { ...current[actionId], ...change } };
        writeProgress(geographyId, next);
        return next;
      });
    },
    [geographyId],
  );

  return {
    statusOf: (actionId: string): ActionStatus =>
      progress[actionId]?.status ?? "not-started",
    assignmentOf: (actionId: string) => progress[actionId]?.assignment ?? null,
    setStatus: (actionId: string, status: ActionStatus) => update(actionId, { status }),
    setAssignment: (actionId: string, assignment: Assignment) =>
      update(actionId, { assignment }),
  };
}

export type ActionProgress = ReturnType<typeof useActionProgress>;

function readProgress(geographyId: string): Progress {
  try {
    const raw = window.localStorage.getItem(storageKey(geographyId));
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

function writeProgress(geographyId: string, progress: Progress) {
  try {
    window.localStorage.setItem(storageKey(geographyId), JSON.stringify(progress));
  } catch {
    // Private mode or full storage: the change still holds for this visit.
  }
}
