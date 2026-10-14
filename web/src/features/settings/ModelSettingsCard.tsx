"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/Button";
import { SettingsCard } from "@/features/planning/SettingsCard";
import {
  fetchModelSettings,
  saveModelSettings,
  type ModelSettings,
  type ModelSettingsValues,
  type SettingOption,
} from "@/lib/modelSettingsClient";

import styles from "./ModelSettingsCard.module.css";

/**
 * Which pregnancy windows or age groups, scenarios and data views each
 * country offers for an outcome.
 *
 * The API owns every rule: it lists only what the published tables and model
 * releases support, refuses a change that would widen them, and applies the
 * saved settings to the dashboard. This card only edits a draft and sends it.
 */

const OUTCOME_LABELS: Record<string, string> = {
  lbw: "Low birth weight",
  under_5_mortality: "Under-five mortality",
};

const VIEW_LABELS: Record<string, string> = {
  outlook: "Outlook",
  live: "Monthly model",
};

type Props = { accessToken: string };

export function ModelSettingsCard({ accessToken }: Props) {
  const [items, setItems] = useState<ModelSettings[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchModelSettings(accessToken, controller.signal)
      .then(setItems)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load settings.");
      });
    return () => controller.abort();
  }, [accessToken]);

  return (
    <SettingsCard
      eyebrow="Model settings"
      title="Options offered per country"
      headingId="model-settings-heading"
      description="Switch off model options a country should not see. Settings can only narrow what the model supports, and every change is recorded in the activity log."
      loading={items === null && !error}
      error={error}
    >
      {items !== null && items.length === 0 ? (
        <p className={styles.empty} role="status">
          No model is installed for the countries you can see.
        </p>
      ) : (
        <div className={styles.list}>
          {(items ?? []).map((item) => (
            <ModelSettingsForm
              key={`${item.country_code}|${item.outcome}`}
              item={item}
              accessToken={accessToken}
            />
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

type SaveState =
  { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

function ModelSettingsForm({
  item,
  accessToken,
}: {
  item: ModelSettings;
  accessToken: string;
}) {
  const [saved, setSaved] = useState(item);
  const [draft, setDraft] = useState<ModelSettingsValues>(item.settings);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const title = `${saved.country_name} · ${OUTCOME_LABELS[saved.outcome] ?? saved.outcome}`;
  const { available } = saved;

  function update(next: ModelSettingsValues) {
    setDraft(next);
    setState({ kind: "idle" });
  }

  async function save() {
    setState({ kind: "saving" });
    try {
      const result = await saveModelSettings(
        accessToken,
        saved.country_code,
        saved.outcome,
        draft,
      );
      setSaved(result);
      setDraft(result.settings);
      setState({ kind: "saved" });
    } catch (cause) {
      setState({
        kind: "error",
        message:
          cause instanceof Error ? cause.message : "The settings could not be saved.",
      });
    }
  }

  return (
    <fieldset className={styles.item}>
      <legend className={styles.itemTitle}>{title}</legend>
      <OptionGroup
        legend={available.selector_label}
        options={available.selectors}
        enabled={draft.selectors}
        defaultCode={draft.default_selector}
        onChange={(selectors, defaultSelector) =>
          update({ ...draft, selectors, default_selector: defaultSelector })
        }
      />
      <OptionGroup
        legend="Scenarios"
        options={available.scenarios}
        enabled={draft.scenarios}
        defaultCode={draft.default_scenario}
        onChange={(scenarios, defaultScenario) =>
          update({ ...draft, scenarios, default_scenario: defaultScenario })
        }
      />
      <OptionGroup
        legend="Data views"
        options={available.data_modes}
        enabled={draft.data_modes}
        onChange={(dataModes) => update({ ...draft, data_modes: dataModes })}
      />
      <div className={styles.footer}>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={state.kind === "saving"}
          aria-label={`Save ${title}`}
        >
          {state.kind === "saving" ? "Saving…" : "Save"}
        </Button>
        {state.kind === "saved" ? (
          <span className={styles.saved} role="status">
            Saved.
          </span>
        ) : null}
        {state.kind === "error" ? (
          <span className={styles.error} role="alert">
            {state.message}
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}

function OptionGroup({
  legend,
  options,
  enabled,
  defaultCode,
  onChange,
}: {
  legend: string;
  options: SettingOption[];
  enabled: string[];
  /** Omit for a list without a default. */
  defaultCode?: string | null;
  onChange: (enabled: string[], defaultCode: string | null) => void;
}) {
  const radioName = useId();
  if (options.length === 0) return null;
  const withDefault = defaultCode !== undefined;
  // The outlook reads the default, so it is chosen among the outlook's
  // options when there are any.
  const outlook = options.filter((option) => option.views.includes("outlook"));
  const defaultable = new Set((outlook.length ? outlook : options).map((o) => o.code));
  const showViews = new Set(options.flatMap((option) => option.views)).size > 1;

  function toggle(code: string, on: boolean) {
    const next = options
      .map((option) => option.code)
      .filter((value) => (value === code ? on : enabled.includes(value)));
    let nextDefault = defaultCode ?? null;
    if (withDefault && (nextDefault === null || !next.includes(nextDefault)))
      nextDefault = next.find((value) => defaultable.has(value)) ?? null;
    onChange(next, nextDefault);
  }

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupTitle}>{legend}</legend>
      <ul className={styles.options}>
        {options.map((option) => {
          const on = enabled.includes(option.code);
          return (
            <li key={option.code} className={styles.option}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(event) => toggle(option.code, event.target.checked)}
                />
                {option.label}
                {showViews ? (
                  <span className={styles.view}>
                    {option.views.map((view) => VIEW_LABELS[view] ?? view).join(", ")}
                  </span>
                ) : null}
              </label>
              {withDefault && defaultable.has(option.code) ? (
                <label className={styles.default}>
                  <input
                    type="radio"
                    name={radioName}
                    checked={defaultCode === option.code}
                    disabled={!on}
                    onChange={() => onChange(enabled, option.code)}
                    aria-label={`Default: ${option.label}`}
                  />
                  Default
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
