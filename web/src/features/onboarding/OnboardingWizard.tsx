"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Pill } from "@/components/Pill";
import { Select } from "@/components/Select";
import { Stepper, type Step } from "@/components/Stepper";
import { TextInput } from "@/components/TextInput";
import { COUNTRIES, GEO_DATA, geoLabelForLevel, subGeoLabelForLevel } from "./data/geo";
import { SECTORS } from "./data/sectors";
import styles from "./OnboardingWizard.module.css";

const STEPS: Step[] = [
  { id: "country", title: "Country", sub: "Select your country" },
  { id: "area", title: "Administrative area", sub: "Level & geography" },
  { id: "sectors", title: "Sector & roles", sub: "Your role & collaborators" },
  { id: "workspace", title: "CHART workspace", sub: "Review & launch" },
];

export const exampleSetupSectors: SetupSector[] = SECTORS.map(({ id, label }) => ({
  id,
  label,
}));

export type SetupSector = {
  id: string;
  label: string;
};

export type OnboardingState = {
  country: string | null;
  level: string | null;
  geo: string | null;
  subgeo: string | null;
  primarySectorId: string | null;
  collaboratingSectorIds: Set<string>;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

function emptyState(): OnboardingState {
  return {
    country: null,
    level: null,
    geo: null,
    subgeo: null,
    primarySectorId: null,
    collaboratingSectorIds: new Set(),
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  };
}

type Props = {
  sectors?: SetupSector[];
  actionRepositoryCount?: number;
  initialStep?: number;
  initialState?: Partial<OnboardingState>;
  onLaunch?: (state: OnboardingState) => void | Promise<void>;
};

export function OnboardingWizard({
  sectors = exampleSetupSectors,
  actionRepositoryCount,
  initialStep = 0,
  initialState,
  onLaunch,
}: Props) {
  const [state, setState] = useState<OnboardingState>(() => ({
    ...emptyState(),
    ...initialState,
    collaboratingSectorIds: new Set(initialState?.collaboratingSectorIds ?? []),
  }));
  const [idx, setIdx] = useState(() =>
    Math.max(0, Math.min(STEPS.length - 1, initialStep)),
  );
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [showAdminDialog, setShowAdminDialog] = useState(false);

  const levels = useMemo(
    () => (state.country ? Object.keys(GEO_DATA[state.country]) : []),
    [state.country],
  );
  const levelCfg =
    state.country && state.level ? GEO_DATA[state.country][state.level] : undefined;
  const subOptions = levelCfg?.sub && state.geo ? levelCfg.sub[state.geo] : null;
  const adminReady =
    state.adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail) &&
    state.adminPassword.length >= 8;

  const canContinue = (() => {
    if (idx === 0) return !!state.country;
    if (idx === 1) {
      if (!state.level || !state.geo) return false;
      return !levelCfg?.sub || !!state.subgeo;
    }
    if (idx === 2) return !!state.primarySectorId;
    return true;
  })();

  async function next() {
    if (idx < STEPS.length - 1) {
      setLaunchError(null);
      setIdx(idx + 1);
      return;
    }
    if (!adminReady) {
      setShowAdminDialog(true);
      return;
    }
    await launch();
  }

  async function launch() {
    if (!onLaunch || isLaunching) return;

    setIsLaunching(true);
    setLaunchError(null);
    try {
      await onLaunch(state);
    } catch (error) {
      setLaunchError(
        error instanceof Error
          ? error.message
          : "CHART could not finish installation setup. Please try again.",
      );
    } finally {
      setIsLaunching(false);
    }
  }

  function setCountry(value: string) {
    setState((current) => ({
      ...current,
      country: value || null,
      level: null,
      geo: null,
      subgeo: null,
    }));
  }

  function setLevel(value: string) {
    setState((current) => ({
      ...current,
      level: value || null,
      geo: null,
      subgeo: null,
    }));
  }

  function setGeo(value: string) {
    setState((current) => ({ ...current, geo: value || null, subgeo: null }));
  }

  function selectPrimarySector(id: string) {
    setState((current) => {
      const collaboratingSectorIds = new Set(current.collaboratingSectorIds);
      collaboratingSectorIds.delete(id);
      return {
        ...current,
        primarySectorId: id,
        collaboratingSectorIds,
      };
    });
  }

  function toggleCollaboratingSector(id: string) {
    setState((current) => {
      const collaboratingSectorIds = new Set(current.collaboratingSectorIds);
      if (collaboratingSectorIds.has(id)) collaboratingSectorIds.delete(id);
      else collaboratingSectorIds.add(id);
      return { ...current, collaboratingSectorIds };
    });
  }

  return (
    <>
      <div className={styles.frame}>
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <div className={styles.logo}>CHART</div>
            <div className={styles.intro}>
              <h2>Find your role in the CHART workspace</h2>
              <p>
                Tell us the geography, administrative area, and sector you represent,
                and CHART will set up a shared workspace for you and key departments to
                drive climate and health planning in your region.
              </p>
            </div>
            <Stepper
              steps={STEPS}
              currentIndex={idx}
              onStepClick={(stepIndex) => {
                if (stepIndex <= idx) setIdx(stepIndex);
              }}
            />
          </aside>

          <div className={styles.content}>
            <div className={styles.header}>
              <div className={styles.indicator}>
                Step {idx + 1} of {STEPS.length} · {STEPS[idx].title}
              </div>
            </div>

            <div className={styles.main}>
              {idx === 0 ? (
                <section>
                  <p className={styles.heading}>What geography do you represent?</p>
                  <p className={styles.desc}>
                    Choose the country you represent to load the right administrative
                    boundaries, climate data and health system context.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Select country</NumberedLabel>
                    <Select
                      className={styles.setupSelect}
                      placeholder="— Choose a country —"
                      value={state.country ?? ""}
                      onChange={(event) => setCountry(event.currentTarget.value)}
                      options={COUNTRIES.map((country) => ({
                        value: country,
                        label: country,
                      }))}
                    />
                  </div>
                  <div className={styles.infoNote}>
                    <strong>More countries coming soon</strong>
                    CHART currently supports India and Kenya. Expansion to additional
                    countries in Africa and Asia is underway.
                  </div>
                </section>
              ) : null}

              {idx === 1 ? (
                <section>
                  <p className={styles.heading}>Your administrative area</p>
                  <p className={styles.desc}>
                    Choose the administrative level you are responsible for and the
                    specific geography you serve.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Administrative level</NumberedLabel>
                    <Select
                      className={styles.setupSelect}
                      placeholder="— Choose a level —"
                      value={state.level ?? ""}
                      onChange={(event) => setLevel(event.currentTarget.value)}
                      options={levels.map((level) => ({
                        value: level,
                        label: level,
                      }))}
                    />
                  </div>
                  {levelCfg ? (
                    <div className={styles.subsection}>
                      <NumberedLabel n={2}>
                        {geoLabelForLevel(state.level!)}
                      </NumberedLabel>
                      <Select
                        className={styles.setupSelect}
                        placeholder="— Choose —"
                        value={state.geo ?? ""}
                        onChange={(event) => setGeo(event.currentTarget.value)}
                        options={levelCfg.options.map((option) => ({
                          value: option,
                          label: option,
                        }))}
                      />
                    </div>
                  ) : null}
                  {subOptions ? (
                    <div className={styles.subsection}>
                      <NumberedLabel n={3}>
                        {subGeoLabelForLevel(state.level!)}
                      </NumberedLabel>
                      <Select
                        className={styles.setupSelect}
                        placeholder="— Choose —"
                        value={state.subgeo ?? ""}
                        onChange={(event) =>
                          setState((current) => ({
                            ...current,
                            subgeo: event.currentTarget.value || null,
                          }))
                        }
                        options={subOptions.map((option) => ({
                          value: option,
                          label: option,
                        }))}
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {idx === 2 ? (
                <section>
                  <p className={styles.heading}>Your sector of work</p>
                  <p className={styles.desc}>
                    Climate and health risks cut across sectors — no single department
                    can manage them alone. Tell us where you sit and who you already
                    work with, so CHART can connect you with key departments tackling
                    the same risks.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Your primary sector</NumberedLabel>
                    <div className={styles.sectorGrid}>
                      {sectors.map((sector) => (
                        <Pill
                          key={sector.id}
                          selected={state.primarySectorId === sector.id}
                          onClick={() => selectPrimarySector(sector.id)}
                        >
                          {sector.label}
                        </Pill>
                      ))}
                    </div>
                  </div>
                  <div className={styles.subsection}>
                    <NumberedLabel n={2}>
                      Sectors you already collaborate with
                    </NumberedLabel>
                    <p className={styles.collabHelp}>
                      Invite the departments you already collaborate with. You can add
                      more later.
                    </p>
                    <div className={styles.sectorGrid}>
                      {sectors
                        .filter((sector) => sector.id !== state.primarySectorId)
                        .map((sector) => (
                          <Pill
                            key={sector.id}
                            selected={state.collaboratingSectorIds.has(sector.id)}
                            onClick={() => toggleCollaboratingSector(sector.id)}
                          >
                            {sector.label}
                          </Pill>
                        ))}
                    </div>
                  </div>
                  <div className={styles.whyBox}>
                    <strong>Why this matters</strong>
                    <p>
                      Climate-health risks rarely respect ministry lines. CHART surfaces
                      shared risks, joint actions and common data — so planning happens
                      together, not in silos.
                    </p>
                  </div>
                </section>
              ) : null}

              {idx === 3 ? (
                <section>
                  <p className={styles.heading}>Ready to join CHART workspace</p>
                  <p className={styles.desc}>
                    Here&apos;s a summary of your setup. You can update it anytime in
                    Settings.
                  </p>
                  <SetupReview
                    state={state}
                    sectors={sectors}
                    actionRepositoryCount={actionRepositoryCount}
                    onEdit={setIdx}
                  />
                </section>
              ) : null}
            </div>

            <div className={styles.footer}>
              {launchError ? (
                <p className={styles.launchError} role="alert">
                  {launchError}
                </p>
              ) : null}
              <div className={styles.actions}>
                {idx > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => setIdx((current) => current - 1)}
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  onClick={() => void next()}
                  disabled={!canContinue || isLaunching}
                >
                  {idx === STEPS.length - 1
                    ? isLaunching
                      ? "Launching CHART…"
                      : "Launch CHART"
                    : "Continue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showAdminDialog ? (
        <div className={styles.dialogBackdrop}>
          <section
            className={styles.adminDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-admin-title"
          >
            <span className={styles.dialogEyebrow}>First administrator</span>
            <h2 id="setup-admin-title">Create the account that will own CHART</h2>
            <p>
              This administrator can invite people and assign their roles and planning
              areas after launch.
            </p>
            <div className={styles.adminGrid}>
              <TextInput
                id="setup-admin-name"
                label="Full name"
                value={state.adminName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    adminName: event.currentTarget.value,
                  }))
                }
                autoComplete="name"
              />
              <TextInput
                id="setup-admin-email"
                label="Email address"
                type="email"
                value={state.adminEmail}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    adminEmail: event.currentTarget.value,
                  }))
                }
                autoComplete="email"
              />
              <TextInput
                id="setup-admin-password"
                label="Administrator password"
                type="password"
                minLength={8}
                value={state.adminPassword}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    adminPassword: event.currentTarget.value,
                  }))
                }
                autoComplete="new-password"
              />
            </div>
            <p className={styles.adminNote}>
              Use at least eight characters. After setup, sign in with the email address
              above.
            </p>
            {launchError ? (
              <p className={styles.dialogError} role="alert">
                {launchError}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setLaunchError(null);
                  setShowAdminDialog(false);
                }}
                disabled={isLaunching}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void launch()}
                disabled={!adminReady || isLaunching}
              >
                {isLaunching ? "Launching CHART…" : "Create account & launch"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function NumberedLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className={styles.sublabel}>
      <div className={styles.subnum}>{n}</div>
      <div className={styles.subtitle}>{children}</div>
    </div>
  );
}

function SetupReview({
  state,
  sectors,
  actionRepositoryCount,
  onEdit,
}: {
  state: OnboardingState;
  sectors: SetupSector[];
  actionRepositoryCount?: number;
  onEdit: (index: number) => void;
}) {
  const primarySector = sectors.find((sector) => sector.id === state.primarySectorId);
  const collaboratingSectors = sectors.filter((sector) =>
    state.collaboratingSectorIds.has(sector.id),
  );
  const geography = state.subgeo ?? state.geo ?? state.country ?? "—";
  const workspaceSector = primarySector?.label.toLowerCase() ?? "your sector";

  return (
    <div className={styles.reviewStack}>
      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Geography</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(0)}>
            Edit
          </button>
        </div>
        <div className={styles.reviewGrid}>
          <div>
            <div className={styles.reviewLabel}>Country</div>
            <div className={styles.reviewValue}>{state.country ?? "—"}</div>
          </div>
          <div>
            <div className={styles.reviewLabel}>Administrative level</div>
            <div className={styles.reviewValue}>{state.level ?? "—"}</div>
          </div>
          <div>
            <div className={styles.reviewLabel}>Geography</div>
            <div className={styles.reviewValue}>{geography}</div>
          </div>
        </div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div>
            <div className={styles.reviewLabel}>Your sector</div>
          </div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        <div>
          <div className={styles.reviewValue}>{primarySector?.label ?? "—"}</div>
        </div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Collaborating sectors</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        {collaboratingSectors.length ? (
          <div className={styles.sectorGrid}>
            {collaboratingSectors.map((sector) => (
              <Chip key={sector.id}>{sector.label}</Chip>
            ))}
          </div>
        ) : (
          <div className={styles.reviewValue}>None selected</div>
        )}
      </div>

      {actionRepositoryCount !== undefined ? (
        <div className={styles.reviewCard}>
          <div className={styles.reviewLabel}>Action repository</div>
          <div className={styles.reviewValue}>
            {actionRepositoryCount} published actions loaded
          </div>
        </div>
      ) : null}

      <div className={styles.launchBanner}>
        <h3>CHART collaborative workspace is ready</h3>
        <p>
          Surfacing shared risks and joint actions to protect {workspaceSector} in{" "}
          {geography} — bringing departments together around a common view.
        </p>
      </div>
    </div>
  );
}
