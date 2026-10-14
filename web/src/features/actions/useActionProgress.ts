"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { getStoredAuthSession, subscribeAuthSession } from "@/lib/authClient";

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

// Per user as well as per place: a shared browser must not show one planner
// another planner's statuses and assignees.
const storageKey = (userId: string, geographyId: string) =>
  `chart.actions.progress.${userId}.${geographyId}`;
/** Before progress was per user. Adopted once by the first user to open it. */
const legacyStorageKey = (geographyId: string) =>
  `chart.actions.progress.${geographyId}`;

function useSignedInUserId() {
  return useSyncExternalStore(
    subscribeAuthSession,
    () => getStoredAuthSession()?.user.userId ?? "",
    () => "",
  );
}

/**
 * Status and district assignments a planner records against each action for
 * one place. Kept in this browser until the planning API stores them, so the
 * dashboard list and the full actions page stay in step with each other.
 */
export function useActionProgress(geographyId: string) {
  const userId = useSignedInUserId();
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    if (!userId) {
      setProgress({});
      return;
    }
    const key = storageKey(userId, geographyId);
    setProgress(readProgress(key, geographyId));
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setProgress(readProgress(key, geographyId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [geographyId, userId]);

  const update = useCallback(
    (actionId: string, change: Progress[string]) => {
      setProgress((current) => {
        const next = { ...current, [actionId]: { ...current[actionId], ...change } };
        if (userId) writeProgress(storageKey(userId, geographyId), next);
        return next;
      });
    },
    [geographyId, userId],
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

function readProgress(key: string, geographyId: string): Progress {
  try {
    let raw = window.localStorage.getItem(key);
    if (raw === null) {
      const legacy = legacyStorageKey(geographyId);
      raw = window.localStorage.getItem(legacy);
      if (raw !== null) {
        window.localStorage.setItem(key, raw);
        window.localStorage.removeItem(legacy);
      }
    }
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

function writeProgress(key: string, progress: Progress) {
  try {
    window.localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // Private mode or full storage: the change still holds for this visit.
  }
}
