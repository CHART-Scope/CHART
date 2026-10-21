"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { SettingsCard } from "@/features/planning/SettingsCard";
import {
  listModelReleases,
  reloadModelRelease,
  syncDeployedModels,
  type ReleaseInfo,
} from "@/lib/modelsClient";

import styles from "./ModelReleasesCard.module.css";

type Status = { text: string; error: boolean } | null;

/**
 * Settings > Models: every model release loaded into this installation, with
 * a pull of the deployed manifests and a per-release reload. It replaces the
 * old summary card plus separate /settings/models page, which showed the same
 * releases twice.
 */
export function ModelReleasesCard({ accessToken }: { accessToken: string }) {
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reloadingId, setReloadingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(async () => {
    const items = await listModelReleases(accessToken);
    setReleases(items);
    setLoadError(null);
    return items;
  }, [accessToken]);

  useEffect(() => {
    load().catch((error: unknown) =>
      setLoadError(error instanceof Error ? error.message : String(error)),
    );
  }, [load]);

  async function sync() {
    setSyncing(true);
    setStatus({ text: "Pulling manifests and warming artifacts…", error: false });
    try {
      await syncDeployedModels(accessToken);
      const paths = (await load())
        .filter((release) => release.is_active && release.manifest_source_path)
        .map((release) => release.manifest_source_path);
      setStatus({
        text: paths.length
          ? `Installed from:\n${paths.join("\n")}`
          : "Sync complete — no active manifests were resolved.",
        error: false,
      });
    } catch (error) {
      setStatus({ text: `Sync failed: ${messageOf(error)}`, error: true });
    } finally {
      setSyncing(false);
    }
  }

  async function reload(release: ReleaseInfo) {
    setReloadingId(release.id);
    setStatus({ text: `Reloading ${release.id} into R runtime…`, error: false });
    try {
      await reloadModelRelease(release.id, accessToken);
      setStatus({ text: `Reloaded ${release.id}.`, error: false });
    } catch (error) {
      setStatus({
        text: `Reload failed for ${release.id}: ${messageOf(error)}`,
        error: true,
      });
    } finally {
      setReloadingId(null);
    }
  }

  const active = releases?.filter((release) => release.is_active).length ?? 0;

  return (
    <SettingsCard
      eyebrow="Models"
      title="Installed model releases"
      headingId="model-releases-heading"
      description={
        releases && releases.length > 0
          ? `${active} active of ${releases.length} installed.`
          : undefined
      }
      loading={releases === null && !loadError}
      error={loadError ? `Could not load releases: ${loadError}` : null}
      action={
        <Button size="sm" onClick={() => void sync()} disabled={syncing}>
          {syncing ? "Pulling updates…" : "Pull updates"}
        </Button>
      }
    >
      <p
        className={styles.status}
        data-error={status?.error || undefined}
        role="status"
        aria-live="polite"
      >
        {status?.text ?? ""}
      </p>
      {releases?.length === 0 ? (
        <p className={styles.empty}>
          No model releases registered yet. Drop a <code>model-release.*.json</code>{" "}
          under <code>pipelines/models/&lt;family&gt;/</code> and pull updates.
        </p>
      ) : (
        <ul className={styles.list}>
          {(releases ?? []).map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              onReload={() => void reload(release)}
              reloading={reloadingId === release.id}
            />
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

function ReleaseRow({
  release,
  onReload,
  reloading,
}: {
  release: ReleaseInfo;
  onReload: () => void;
  reloading: boolean;
}) {
  const details: [string, string | null][] = [
    ["Manifest", release.manifest_source_path],
    ["S3 base", release.base_uri],
    ["Git ref", release.source_git_ref],
    [
      "Activated",
      release.activated_at ? new Date(release.activated_at).toLocaleString() : null,
    ],
  ];
  return (
    <li className={styles.release}>
      <div className={styles.releaseHead}>
        <span className={styles.releaseId}>{release.id}</span>
        <Button size="sm" variant="secondary" onClick={onReload} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload"}
        </Button>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge} data-active={release.is_active || undefined}>
          {release.is_active ? "Active" : release.status}
        </span>
        {[release.outcome_label, release.climate_hazard_label, `v${release.version}`]
          .filter(Boolean)
          .map((label) => (
            <span key={label} className={styles.badge}>
              {label}
            </span>
          ))}
        <span className={styles.badge}>
          {release.area_count} area{release.area_count === 1 ? "" : "s"}
        </span>
      </div>
      <details className={styles.more}>
        <summary>Details</summary>
        <dl className={styles.detail}>
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        {release.model_files.length > 0 ? (
          <ul className={styles.files}>
            {release.model_files.map((file) => (
              <li key={file.filename}>
                {file.filename} ·{" "}
                <span title={file.sha256}>{file.sha256.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
