"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import {
  listModelReleases,
  reloadModelRelease,
  syncDeployedModels,
  type ReleaseInfo,
} from "@/lib/modelsClient";

import styles from "./page.module.css";

export default function ModelsPage() {
  return (
    <RequireAuth>{(session) => <AuthorizedModels session={session} />}</RequireAuth>
  );
}

type Tab = "installed" | "library";

function AuthorizedModels({ session }: { session: AuthSession }) {
  const router = useRouter();
  const isAdmin = session.user.roles.includes("chart_admin");
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reloadingId, setReloadingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("installed");

  useEffect(() => {
    if (!isAdmin) router.replace("/plan");
  }, [isAdmin, router]);

  const refresh = useCallback(async () => {
    try {
      const items = await listModelReleases();
      setReleases(items);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setStatus("Pulling manifests and warming artifacts…");
    setStatusIsError(false);
    try {
      await syncDeployedModels();
      const fresh = await listModelReleases();
      setReleases(fresh);
      const active = fresh.filter((release) => release.is_active);
      const paths = active
        .map((release) => release.manifest_source_path)
        .filter((path): path is string => Boolean(path));
      if (paths.length === 0) {
        setStatus("Sync complete — no active manifests were resolved.");
      } else {
        setStatus(`Installed from:\n${paths.join("\n")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Sync failed: ${message}`);
      setStatusIsError(true);
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleReload = useCallback(async (release: ReleaseInfo) => {
    setReloadingId(release.id);
    setStatus(`Reloading ${release.id} into R runtime…`);
    setStatusIsError(false);
    try {
      await reloadModelRelease(release.id);
      setStatus(`Reloaded ${release.id}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Reload failed for ${release.id}: ${message}`);
      setStatusIsError(true);
    } finally {
      setReloadingId(null);
    }
  }, []);

  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  if (!isAdmin) return null;

  return (
    <>
      <IconSprite />
      <AppShell
        nav={appNavForRoles(session.user.roles)}
        activeNav="settings"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <section className={styles.page}>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Models</h1>
              <p className={styles.subtitle}>
                Every model release loaded into this installation.{" "}
                <Link href="/settings">Back to settings</Link>
              </p>
            </div>
            <div className={styles.actions}>
              {activeTab === "installed" ? (
                <button
                  type="button"
                  className={styles.syncButton}
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? "Pulling updates…" : "Pull updates"}
                </button>
              ) : null}
            </div>
          </header>

          <div className={styles.tabs} role="tablist" aria-label="Model view">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "installed"}
              className={
                activeTab === "installed"
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              onClick={() => setActiveTab("installed")}
            >
              Installed
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "library"}
              className={
                activeTab === "library"
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              onClick={() => setActiveTab("library")}
            >
              Library
            </button>
          </div>

          {activeTab === "installed" ? (
            <>
              <p
                className={
                  statusIsError
                    ? `${styles.status} ${styles.statusError}`
                    : styles.status
                }
                role="status"
                aria-live="polite"
              >
                {status ?? ""}
              </p>

              {loadError ? (
                <p className={`${styles.status} ${styles.statusError}`}>
                  Could not load releases: {loadError}
                </p>
              ) : releases === null ? (
                <p className={styles.status}>Loading…</p>
              ) : releases.length === 0 ? (
                <p className={styles.empty}>
                  No model releases registered yet. Drop a{" "}
                  <code>model-release.*.json</code> under{" "}
                  <code>pipelines/models/&lt;family&gt;/</code> and click Pull updates.
                </p>
              ) : (
                <div className={styles.list}>
                  {releases.map((release) => (
                    <ReleaseCard
                      key={release.id}
                      release={release}
                      onReload={handleReload}
                      reloading={reloadingId === release.id}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={styles.libraryPlaceholder}>
              <p className={styles.libraryTitle}>Public model library</p>
              <p className={styles.libraryBody}>
                This tab will list model releases available to install into this
                environment — every model CHART supports, whether or not it&apos;s
                already loaded here.
              </p>
              <p className={styles.libraryHint}>
                Not wired up yet. Until it is, the Installed tab is the source of truth.
              </p>
            </div>
          )}
        </section>
      </AppShell>
    </>
  );
}

function ReleaseCard({
  release,
  onReload,
  reloading,
}: {
  release: ReleaseInfo;
  onReload: (release: ReleaseInfo) => void;
  reloading: boolean;
}) {
  const badgeClass = release.is_active
    ? `${styles.badge} ${styles.badgeActive}`
    : `${styles.badge} ${styles.badgeInactive}`;
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.releaseId}>{release.id}</span>
        <div className={styles.badges}>
          <span className={badgeClass}>
            {release.is_active ? "Active" : release.status}
          </span>
          {release.outcome_label ? (
            <span className={styles.badge}>{release.outcome_label}</span>
          ) : null}
          {release.climate_hazard_label ? (
            <span className={styles.badge}>{release.climate_hazard_label}</span>
          ) : null}
          <span className={styles.badge}>v{release.version}</span>
          <span className={styles.badge}>
            {release.area_count} area{release.area_count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.reloadButton}
          onClick={() => onReload(release)}
          disabled={reloading}
        >
          {reloading ? "Reloading…" : "Reload"}
        </button>
      </div>
      <dl className={styles.detail}>
        {release.manifest_source_path ? (
          <>
            <dt>Manifest</dt>
            <dd>{release.manifest_source_path}</dd>
          </>
        ) : null}
        {release.base_uri ? (
          <>
            <dt>S3 base</dt>
            <dd>{release.base_uri}</dd>
          </>
        ) : null}
        {release.source_git_ref ? (
          <>
            <dt>Git ref</dt>
            <dd>{release.source_git_ref}</dd>
          </>
        ) : null}
        {release.activated_at ? (
          <>
            <dt>Activated</dt>
            <dd>{new Date(release.activated_at).toLocaleString()}</dd>
          </>
        ) : null}
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
    </article>
  );
}
