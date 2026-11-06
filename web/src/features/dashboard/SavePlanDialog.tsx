"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { Button, buttonClassName } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/TextInput";
import {
  createSavedPlan,
  type SavedPlan,
  type SavedPlanInput,
} from "@/lib/savedPlansClient";

import styles from "./SavePlanDialog.module.css";

type Props = {
  /** The plan to save, or null while the dialog is closed. */
  draft: SavedPlanInput | null;
  onClose: () => void;
};

/**
 * Names and saves the dashboard view. The API captures the published
 * estimate itself, so what is saved is what the model gives for the choices,
 * never figures copied from the page.
 */
export function SavePlanDialog({ draft, onClose }: Props) {
  const inputId = useId();
  const [name, setName] = useState("");
  const [state, setState] = useState<
    | { status: "idle" | "saving" }
    | { status: "saved"; plan: SavedPlan }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (draft) {
      setName(draft.name);
      setState({ status: "idle" });
    }
  }, [draft]);

  async function save() {
    if (!draft || !name.trim()) return;
    setState({ status: "saving" });
    try {
      const plan = await createSavedPlan({ ...draft, name: name.trim() });
      setState({ status: "saved", plan });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }

  const saved = state.status === "saved" ? state.plan : null;
  const actionsQuery = saved
    ? new URLSearchParams({
        outcome: saved.outcome,
        plan: saved.id,
        ...(saved.admin_unit_id ? { admin_unit: saved.admin_unit_id } : {}),
      })
    : null;

  return (
    <Modal
      open={draft !== null}
      onClose={onClose}
      size="sm"
      title={saved ? "Plan saved" : "Save this view as a plan"}
      description={
        saved
          ? "Its estimate and model release are kept with it, so you can come back to it after the model is updated."
          : "Saves this outcome, place and selection with the estimate the model gives for it now."
      }
      footer={
        saved ? (
          <>
            <Link href="/plan" className={styles.link}>
              All saved plans
            </Link>
            <Link
              href={`/dashboard/${encodeURIComponent(saved.geography_id)}/actions?${actionsQuery}`}
              className={buttonClassName({ size: "sm" })}
            >
              See recommendations
            </Link>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              form={`${inputId}-form`}
              disabled={!name.trim() || state.status === "saving"}
            >
              {state.status === "saving" ? "Saving…" : "Save plan"}
            </Button>
          </>
        )
      }
    >
      {saved ? (
        <p className={styles.summary} role="status">
          “{saved.name}” is in your saved plans.
        </p>
      ) : (
        <form
          id={`${inputId}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextInput
            id={inputId}
            label="Plan name"
            value={name}
            maxLength={120}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          {state.status === "error" ? (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
