"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { TextInput } from "@/components/TextInput";
import { SettingsCard } from "@/features/planning/SettingsCard";
import {
  fetchProviderModels,
  fetchRecommendationSettings,
  saveRecommendationSettings,
  type ProviderModels,
  type ProviderOption,
  type RecommendationSettings,
  type RecommendationSettingsValues,
} from "@/lib/recommendationsClient";

import styles from "./RecommendationSettingsCard.module.css";

/**
 * Settings > Recommendations: which ranker orders a plan's actions and which
 * provider and model write the insight. Options the server environment does
 * not enable are shown disabled with what to set; keys never reach the page.
 */
export function RecommendationSettingsCard() {
  const [loaded, setLoaded] = useState<RecommendationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecommendationSettingsValues | null>(null);
  const [models, setModels] = useState<{
    provider: string;
    data?: ProviderModels;
    error?: string;
  } | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchRecommendationSettings(controller.signal)
      .then((result) => {
        setLoaded(result);
        setDraft(result.settings);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  const provider = draft?.insight_provider ?? "template";
  useEffect(() => {
    if (provider === "template") return;
    const controller = new AbortController();
    setModels({ provider });
    fetchProviderModels(provider, controller.signal)
      .then((data) => setModels({ provider, data }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setModels({ provider, error: error.message });
      });
    return () => controller.abort();
  }, [provider]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveRecommendationSettings(draft);
      setLoaded(result);
      setDraft(result.settings);
      setStatus({
        text: "Saved. New recommendations use these settings.",
        error: false,
      });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    } finally {
      setSaving(false);
    }
  }

  const listed = models?.provider === provider ? models : null;
  const changed =
    loaded && draft && JSON.stringify(loaded.settings) !== JSON.stringify(draft);
  return (
    <SettingsCard
      eyebrow="Recommendations"
      title="How actions are ranked and explained"
      headingId="recommendation-settings-heading"
      description="Credentials and endpoints are set on the API server; choose which configured option CHART uses."
      loading={!loaded && !loadError}
      error={loadError}
    >
      {loaded && draft ? (
        <div className={styles.form}>
          <Select
            label="Ranker"
            value={draft.ranker}
            options={asOptions(loaded.rankers)}
            onChange={(ranker) => setDraft({ ...draft, ranker })}
          />
          <Unavailable options={loaded.rankers} />
          <Select
            label="Insight provider"
            value={draft.insight_provider}
            options={asOptions(loaded.providers)}
            onChange={(insight_provider) =>
              setDraft({ ...draft, insight_provider, insight_model: null })
            }
          />
          <Unavailable options={loaded.providers} />
          {provider !== "template" ? (
            listed?.data && listed.data.models.length > 0 ? (
              <>
                <Select
                  label="Model"
                  value={draft.insight_model ?? ""}
                  placeholder="Choose a model"
                  options={listed.data.models.map((model) => ({
                    value: model,
                    label: model,
                  }))}
                  onChange={(insight_model) => setDraft({ ...draft, insight_model })}
                />
                <p className={styles.hint}>
                  {listed.data.source === "provider"
                    ? "Listed by the provider."
                    : "From CHART_INSIGHT_MODELS on the server."}
                </p>
              </>
            ) : (
              <>
                <TextInput
                  id="insight-model"
                  label="Model ID"
                  value={draft.insight_model ?? ""}
                  maxLength={200}
                  onChange={(event) =>
                    setDraft({ ...draft, insight_model: event.target.value })
                  }
                />
                <p className={styles.hint} role={listed?.error ? "status" : undefined}>
                  {listed?.error ??
                    (listed?.data
                      ? "The provider listed no models."
                      : "Listing models…")}
                </p>
              </>
            )
          ) : null}
          <div className={styles.actions}>
            <Button size="sm" onClick={() => void save()} disabled={!changed || saving}>
              {saving ? "Saving…" : "Save recommendation settings"}
            </Button>
            {status ? (
              <p
                className={status.error ? styles.error : styles.hint}
                role={status.error ? "alert" : "status"}
              >
                {status.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </SettingsCard>
  );
}

function asOptions(options: ProviderOption[]) {
  return options.map((option) => ({
    value: option.id,
    label: option.available ? option.label : `${option.label} (not configured)`,
    disabled: !option.available,
  }));
}

function Unavailable({ options }: { options: ProviderOption[] }) {
  const missing = options.filter((option) => !option.available && option.reason);
  if (missing.length === 0) return null;
  return (
    <ul className={styles.unavailable}>
      {missing.map((option) => (
        <li key={option.id}>
          {option.label}: {option.reason}
        </li>
      ))}
    </ul>
  );
}
